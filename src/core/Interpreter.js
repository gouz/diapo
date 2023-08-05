import { minify } from "html-minifier-terser";
import layoutHTML from "../templates/layout.html.txt";
import themeCSS from "../templates/theme.css.txt";
import mainJS from "../templates/main.js.txt";
import gamepadJS from "../templates/gamepad.js.txt";
import qrcodeLibJS from "../templates/qrcode.lib.js.txt";

const animationTimer = 300;

const socket = `window.slidesk.io = new WebSocket("ws://localhost:#PORT#/ws");`;
const buttonSource = `
  <button id="sdf-showSource" popovertarget="sdf-source">&lt;/&gt;</button>
  <div id="sdf-source" popover><pre>x</pre></div>
`;

let customCSS = "";
let customJS = "";
let customSVJS = "";

const toBinary = (string) => {
  const codeUnits = new Uint16Array(string.length);
  for (let i = 0; i < codeUnits.length; i += 1) {
    codeUnits[i] = string.charCodeAt(i);
  }
  return btoa(String.fromCharCode(...new Uint8Array(codeUnits.buffer)));
};

export default class Interpreter {
  static convert = async (mainFile, options) => {
    // eslint-disable-next-line no-undef
    const sdfMainFile = Bun.file(mainFile);
    if (sdfMainFile.size === 0) {
      return new Error("🤔 main.sdf was not found");
    }
    const presentation = this.#sliceSlides(
      await this.#includes(mainFile),
      options,
    );
    let template = layoutHTML;
    template = template.replace(
      "/* #STYLES# */",
      `:root { --animationTimer: ${animationTimer}ms; }${themeCSS}${
        customCSS.length
          ? `</style><link id="sd-customcss" rel="stylesheet" href="${customCSS}"><style>`
          : ""
      }`,
    );
    template = template.replace(
      "#SCRIPT#",
      `<script type="module" id="sd-scripts" data-sv="${customSVJS}">
          window.slidesk = {
            currentSlide: 0,
            slides: [],
            animationTimer: ${animationTimer},
            qrcode: ${options.qrcode ? "true" : "false"},
            source: ${options.source ? "true" : "false"}
          };
          ${!options.save ? socket.replace("#PORT#", options.port) : ""}
          ${mainJS}
          ${options.gamepad ? gamepadJS : ""}
        </script>${customJS}`,
    );
    [...presentation.matchAll(/<h1>([^\0]*)<\/h1>/g)].forEach((title) => {
      template = template.replace("#TITLE#", title[1]);
    });
    template = template.replace("#SECTIONS#", presentation);
    if (options.source) {
      template += buttonSource;
    }
    if (options.qrcode) {
      template += '<div id="sdf-qrcode">&nbsp;</div>';
    }

    let minified = await minify(template, {
      collapseWhitespace: true,
      removeEmptyElements: true,
      minifyCSS: true,
      minifyJS: true,
      removeComments: true,
    });

    minified = minified.replace(
      '<script type="module" id="sd-scripts"',
      `<script>${qrcodeLibJS}</script><script type="module" id="sd-scripts"`,
    );

    return minified;
  };

  static #replaceAsync = async (str, regex, asyncFn) => {
    const promises = [];
    str.replace(regex, (match, ...args) => {
      const promise = asyncFn(match, ...args);
      promises.push(promise);
    });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift());
  };

  static #includes = async (file) => {
    // eslint-disable-next-line no-undef
    const data = await Bun.file(file).text();
    return this.#replaceAsync(data, /\n!include\(([^()]+)\)/g, async (_, p1) =>
      this.#includes(`${file.substring(0, file.lastIndexOf("/"))}/${p1}`),
    );
  };

  static #sliceSlides = (presentation, options) =>
    [...presentation.split("\n## ")]
      .map((slide, s) => this.#transform(slide, s, options))
      .join("");

  static #transform = (slide, s, options) => {
    let classes = "";
    let slug = null;
    const content = slide
      .replace(/\\r/g, "")
      .split("\n\n")
      .map((paragraph, p) => {
        if (paragraph.startsWith("/::")) return this.#config(paragraph);
        if (paragraph.startsWith("# ")) return this.#mainTitle(paragraph);
        if (paragraph.startsWith("/*")) return this.#comments(paragraph);
        if (paragraph.startsWith("!image")) return this.#image(paragraph);
        if (paragraph.startsWith("- ")) return this.#list(paragraph);
        if (paragraph.startsWith("<")) return paragraph;
        if (p === 0) {
          const spl = [...paragraph.split(".[")];
          if (spl.length !== 1) {
            classes = spl[1].replace("]", "");
          }
          if (paragraph !== "") {
            slug = this.#slugify(paragraph);
            return this.#formatting(spl[0], "h2");
          }
        }
        if (paragraph.length) return this.#formatting(paragraph, "p");
        return "";
      })
      .join("");
    return `<section class="sdf-slide ${classes}" data-slug="${
      slug ?? `${s ? `!slide-${s}` : ""}`
    }" data-source="${
      options.source ? toBinary(slide) : ""
    }">${content}</section>`;
  };

  static #comments = (data) =>
    `<aside class="sdf-notes">${data
      .replace("/*", "")
      .replace("*/", "")
      .split("\n")
      .slice(1)
      .join("<br/>")}</aside>`;

  static #config = (data) => {
    [...data.split("\n")].forEach((line) => {
      if (line.startsWith("custom_css:"))
        customCSS = line.replace("custom_css:", "").trim();
      else if (line.startsWith("custom_js:"))
        customJS = `<script src="${line
          .replace("custom_js:", "")
          .trim()}"></script>`;
      else if (line.startsWith("custom_sv_js"))
        customSVJS = line.replace("custom_sv_js:", "").trim();
    });
    return "";
  };

  static #formatting = (data, element) => {
    let htmlData = data;
    // italic, bold
    [
      ["_", "i"],
      ["\\*", "b"],
      ["```", "pre"],
      ["`", "code"],
      ["˜", "u"],
      ["=", "s"],
    ].forEach((couple) => {
      [
        ...htmlData.matchAll(
          new RegExp(`${couple[0]}([^\\${couple[0]}]+)${couple[0]}`, "gm"),
        ),
      ].forEach((match) => {
        htmlData = htmlData.replace(
          match[0],
          couple[1] === "pre"
            ? `<pre>${match[1]}</pre>`
            : `<span class="${couple[1]}">${match[1]}</span>`,
        );
      });
    });
    // links
    [
      ...htmlData.matchAll(
        /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/g,
      ),
    ].forEach((match) => {
      htmlData = htmlData.replace(
        match[0],
        `<a href="${match[0]}" target="_blank" rel="noopener">${match[0]}</a>`,
      );
    });
    return `<${element}>${htmlData}</${element}>`;
  };

  static #image = (data) => {
    let newData = data;
    [...newData.matchAll(/!image\(([^()]+)\)/g)].forEach((match) => {
      const opts = [...match[1].split("|")];
      newData = newData.replace(
        match[0],
        `<img data-src="${opts[0].trim()}" ${
          opts.length > 1 ? opts[1].trim() : ""
        } />`,
      );
    });
    return newData;
  };

  static #list = (data, level = 1) => {
    const list = [];
    const subs = [];
    [...data.split("\n")].forEach((line) => {
      const reg = new RegExp(`^[-]{${level}} `, "m");
      if (line.match(reg)) {
        if (subs.length) {
          list.push(this.#list(subs.join("\n"), level + 1));
          subs.splice(0, subs.length);
        }
        list.push(`<li>${line.replace(reg, "")}</li>`);
      } else if (line !== "") subs.push(line);
    });
    if (subs.length) {
      list.push(this.#list(subs.join("\n"), level + 1));
    }
    return `<ul>${list.join("")}</ul>`;
  };

  static #mainTitle = (data) => `<h1>${data.replace("# ", "")}</h1>`;

  static #slugify = (data) =>
    data
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
}
