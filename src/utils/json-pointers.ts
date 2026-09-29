import { syntaxTree } from "@codemirror/language";
import { EditorState, Text } from "@codemirror/state";
import { SyntaxNode, SyntaxNodeRef } from "@lezer/common";
import { JSONMode, JSONPointersMap, Side } from "../types";
import {
  JSON5_TOKENS_MAPPING,
  MODES,
  TOKENS,
  YAML_TOKENS_MAPPING,
} from "../constants";
import {
  findNodeIndexInArrayNode,
  getMatchingChildNode,
  getWord,
  isValueNode,
} from "./node";

export const resolveTokenName = (nodeName: string, mode: JSONMode) => {
  switch (mode) {
    case MODES.YAML:
      return YAML_TOKENS_MAPPING[nodeName] ?? nodeName;
    case MODES.JSON5:
      return JSON5_TOKENS_MAPPING[nodeName] ?? nodeName;
    default:
      return nodeName;
  }
};

// adapted from https://discuss.codemirror.net/t/json-pointer-at-cursor-seeking-implementation-critique/4793/3
// this could be useful for other things later!
export function getJsonPointerAt(
  docText: Text,
  node: SyntaxNode,
  mode: JSONMode,
): string {
  const path: string[] = [];
  for (let n: SyntaxNode | null = node; n?.parent; n = n.parent) {
    switch (resolveTokenName(n.parent.name, mode)) {
      case TOKENS.PROPERTY: {
        const name = getMatchingChildNode(n.parent, TOKENS.PROPERTY_NAME, mode);
        if (name) {
          let word = getWord(docText, name).replace(/[/~]/g, (v: string) =>
            v === "~" ? "~0" : "~1",
          );
          // TODO generally filter out pointers to objects being started?
          // if (word !== '') {
          path.unshift(word);
          // }
        }
        break;
      }
      case TOKENS.ARRAY: {
        if (isValueNode(n, mode)) {
          const index = findNodeIndexInArrayNode(n.parent, n, mode);
          path.unshift(`${index}`);
        }
        break;
      }
    }
  }
  if (path.length === 0) {
    // TODO json-schema-library does not seem to like / as root pointer (it probably just uses split and it will return two empty strings). So is this fine? And why is it not prefixed with #?
    return "";
  }
  return "/" + path.join("/");
}

/**
 * retrieve a JSON pointer for a given position in the editor
 * @group Utilities
 */
export const jsonPointerForPosition = (
  state: EditorState,
  pos: number,
  side: Side = -1,
  mode: JSONMode,
) => {
  return getJsonPointerAt(
    state.doc,
    syntaxTree(state).resolve(pos, side),
    mode,
  );
};

/**
 * retrieve a Map of all the json pointers in a document
 * @group Utilities
 */
export const getJsonPointers = (
  state: EditorState,
  mode: JSONMode,
): JSONPointersMap => {
  const tree = syntaxTree(state);
  const pointers: JSONPointersMap = new Map();
  tree.iterate({
    enter: (type: SyntaxNodeRef) => {
      const resolvedName = resolveTokenName(type.name, mode);
      if ([TOKENS.PROPERTY_NAME, TOKENS.OBJECT].includes(resolvedName as any)) {
        const pointer = getJsonPointerAt(state.doc, type.node, mode);

        const { to: keyTo } = type.node;
        // YAML's BlockMapping nodes include the leading newline/indent
        // before their first pair in their own range; use the first
        // child's start instead so the range matches the visible key text
        const keyFrom =
          resolvedName === TOKENS.OBJECT
            ? (type.node.firstChild?.from ?? type.node.from)
            : type.node.from;
        // if there's no value, we can't get the valueFrom/to
        if (!type.node?.nextSibling?.node) {
          pointers.set(pointer, { keyFrom, keyTo });
          return true;
        }
        // skip the colon token between the property name and its value
        const nextNode = type.node?.nextSibling?.node?.nextSibling?.node;
        if (!nextNode) {
          pointers.set(pointer, { keyFrom, keyTo });
          return true;
        }
        const { from: valueFrom, to: valueTo } = nextNode as SyntaxNode;
        pointers.set(pointer, { keyFrom, keyTo, valueFrom, valueTo });
        return true;
      }
    },
  });
  return pointers;
};
