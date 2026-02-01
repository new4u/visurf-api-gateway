/**
 * SVG 渲染服务 — 封装 visurf-svg-api 的 renderToSVG()
 */

// jsdom 需要在 Node.js 环境中提供 DOM 支持
const { JSDOM } = require('jsdom');

// 初始化全局 DOM 环境 (D3 在服务端需要)
function ensureDomEnvironment() {
  if (typeof global.document === 'undefined') {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.document = dom.window.document;
    global.window = dom.window;
    global.navigator = dom.window.navigator;
    global.HTMLElement = dom.window.HTMLElement;
    global.SVGElement = dom.window.SVGElement;
  }
}

// 初始化 DOM
ensureDomEnvironment();

const { renderToSVG } = require('visurf-svg-api');

/**
 * 将 entities + relations 渲染为 SVG 字符串
 * @param {Object[]} entities - 实体数组
 * @param {Object[]} relations - 关系数组
 * @param {Object} options - 渲染选项
 * @returns {{ svg: string, metadata: Object }}
 */
function render(entities, relations, options = {}) {
  const startTime = Date.now();

  const renderOptions = {
    width: options.width || 800,
    height: options.height || 600,
    theme: options.theme || 'COSMIC',
    layoutMode: options.layoutMode || 'FORCE',
    displayLanguage: options.displayLanguage || 'both',
    isTimelineMode: options.isTimelineMode || false
  };

  const svg = renderToSVG(entities, relations, renderOptions);

  const processingTime = Date.now() - startTime;

  return {
    svg,
    metadata: {
      nodeCount: entities.length,
      relationCount: relations.length,
      width: renderOptions.width,
      height: renderOptions.height,
      theme: renderOptions.theme,
      layoutMode: renderOptions.layoutMode,
      processingTime
    }
  };
}

module.exports = { render };
