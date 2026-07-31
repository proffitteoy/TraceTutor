import type { Element, Root } from "hast"
import type { Plugin } from "unified"

type HastParent = Root | Element

const getClassNames = (element: Element) =>
  Array.isArray(element.properties.className)
    ? element.properties.className.map(String)
    : []

const getText = (element: Element): string =>
  element.children
    .map(child => {
      if (child.type === "text") return child.value
      if (child.type === "element") return getText(child)
      return ""
    })
    .join("")

const getMathKind = (element: Element): "inline" | "display" | null => {
  const classes = getClassNames(element)

  if (
    element.tagName === "code" &&
    classes.includes("math-inline")
  ) {
    return "inline"
  }

  if (element.tagName !== "pre") return null

  const code = element.children.find(
    child => child.type === "element" && child.tagName === "code"
  )
  if (!code || code.type !== "element") return null

  return getClassNames(code).includes("math-display") ? "display" : null
}

/**
 * Keep the math node's Markdown position around after rehype-katex replaces
 * the original <code>/<pre>. The wrapper is intentionally outside the node
 * rehype-katex mutates, so its source metadata survives in the final DOM.
 */
export const rehypeMathSource: Plugin<[], Root> = () => tree => {
  let mathIndex = 0

  const visit = (parent: HastParent) => {
    for (let index = 0; index < parent.children.length; index += 1) {
      const child = parent.children[index]
      if (child.type !== "element") continue

      const kind = getMathKind(child)
      if (!kind) {
        visit(child)
        continue
      }

      const start = child.position?.start.offset
      const end = child.position?.end.offset
      const properties: Element["properties"] = {
        className: ["math-source"],
        "data-math-index": String(mathIndex),
        "data-math-kind": kind,
        "data-math-tex": getText(child)
      }

      if (typeof start === "number" && typeof end === "number") {
        properties["data-math-source-start"] = String(start)
        properties["data-math-source-end"] = String(end)
      }

      const wrapper: Element = {
        type: "element",
        tagName: kind === "display" ? "div" : "span",
        properties,
        children: [child],
        position: child.position
      }

      parent.children[index] = wrapper
      mathIndex += 1
    }
  }

  visit(tree)
}
