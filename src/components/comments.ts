export default function comments(data) {
  let newData = data;
  [...newData.matchAll(/\/\*([^*]|(\*+[^*/]))*\*\//gm)].forEach((match) => {
    newData = newData.replace(
      match[0],
      `<aside class="sd-notes">${match[0]
        .replace("/*", "")
        .replace("*/", "")
        .split("\n")
        .slice(1)
        .join("<br/>")}</aside>`,
    );
  });
  return newData;
}
