/**
 * SVG 渲染服务 — 封装 visurf-svg-api 的 renderToSVG()
 */

// 临时模拟实现 - 生成简单的 SVG
// TODO: 替换为实际的 visurf-svg-api 实现
function renderToSVG(entities, relations, options) {
  const { width, height, theme } = options;
  
  // 简单的 SVG 模板
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="100%" height="100%" fill="#1a1a2e"/>`;
  
  // 绘制节点
  entities.forEach((entity, index) => {
    const x = 100 + (index % 3) * 200;
    const y = 100 + Math.floor(index / 3) * 150;
    
    svg += `<g transform="translate(${x},${y})">`;
    svg += `<circle r="40" fill="#16213e" stroke="#0f3460" stroke-width="2"/>`;
    svg += `<text text-anchor="middle" y="5" fill="#e94560" font-size="14">${entity.label || entity.labelEn || entity.id}</text>`;
    svg += `</g>`;
  });
  
  // 绘制连线
  relations.forEach((rel, index) => {
    const sourceIdx = entities.findIndex(e => e.id === rel.source);
    const targetIdx = entities.findIndex(e => e.id === rel.target);
    
    if (sourceIdx >= 0 && targetIdx >= 0) {
      const x1 = 100 + (sourceIdx % 3) * 200;
      const y1 = 100 + Math.floor(sourceIdx / 3) * 150;
      const x2 = 100 + (targetIdx % 3) * 200;
      const y2 = 100 + Math.floor(targetIdx / 3) * 150;
      
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#533483" stroke-width="2"/>`;
    }
  });
  
  svg += `</svg>`;
  return svg;
}

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
