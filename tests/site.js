/*
 * Just enough of Jekyll to run index.html's script outside Jekyll: the real
 * _config.yml, read, and the page's inline script with its Liquid filled in.
 * Shared by the node suite and the browser suite.
 */

"use strict";

const assert = require("node:assert/strict");
const { readSource, inlineScripts } = require("./harness");

/*
 * The subset of YAML that _config.yml uses: top-level scalars, and top-level
 * keys holding a list or a map of scalars. Anything else throws, so a config
 * that outgrows this reader fails here rather than being half-read.
 */
function readConfig(text) {
  const scalar = (s) => {
    s = s.trim();
    const quoted = s.match(/^"(.*)"$/);
    return quoted ? quoted[1] : s;
  };
  const out = {};
  let key = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").replace(/^#.*$/, "");
    if (!line.trim()) continue;
    let m;
    if ((m = line.match(/^([\w-]+):\s*(.*)$/))) {
      key = m[1];
      out[key] = m[2] === "" ? null : scalar(m[2]);
    } else if ((m = line.match(/^ {2}- (.+)$/)) && key) {
      if (out[key] === null) out[key] = [];
      out[key].push(scalar(m[1]));
    } else if ((m = line.match(/^ {2}([^:]+):\s*(.+)$/)) && key) {
      if (out[key] === null) out[key] = {};
      out[key][scalar(m[1])] = scalar(m[2]);
    } else {
      throw new Error(`_config.yml line this reader does not understand: ${raw}`);
    }
  }
  return out;
}

/*
 * index.html's inline script with its Liquid rendered, the way Jekyll would
 * serve it. Only `{{ site.<key> | jsonify }}` appears there; any other tag
 * makes this throw.
 */
function renderedInlineScript(rev) {
  const site = readConfig(readSource("_config.yml", rev));
  const [script] = inlineScripts(readSource("index.html", rev));
  const rendered = script.replace(/\{\{\s*site\.([\w]+)\s*\|\s*jsonify\s*\}\}/g, (_, key) => {
    if (!(key in site)) throw new Error(`_config.yml has no ${key}`);
    return JSON.stringify(site[key]);
  });
  assert.doesNotMatch(rendered, /\{\{|\{%/, "a Liquid tag the test cannot render");
  return rendered;
}

module.exports = { readConfig, renderedInlineScript };
