(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const coords = isNode ? require('./coords.js') : root.CQ.worldCoords;
  const api = factory(coords);
  if (isNode) {
    module.exports = api;
  } else {
    (root.CQ = root.CQ || {}).worldRenderer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (coords) {
  'use strict';

  const PALETTE = {
    skyTop: '#edf3e8',
    skyBottom: '#dfead8',
    sun: '#f6d88d',
    cloud: 'rgba(255,253,243,0.78)',
    grass: ['#a8c98b', '#b2d094', '#9fc384', '#aacc90', '#a5c588'],
    grassSide: '#82a86f',
    grassEdge: '#93b77d',
    path: ['#d9c39a', '#d6bd91', '#ddc9a4', '#d2b98d', '#dcc59e'],
    pathInner: '#ead8b7',
    pathSide: '#b79a72',
    water: ['#8fc5c4', '#96cbca', '#87bfc0', '#9bcfca', '#8bc4c3'],
    waterInner: '#b9ded8',
    waterSide: '#669d9c',
    trunk: '#8b6849',
    trunkShade: '#6d5038',
    leafDark: '#4f8257',
    leafMid: '#5f9563',
    leafLight: '#74a86d',
    leafHighlight: '#8bbd7b',
    wallFront: '#f2d9ad',
    wallSide: '#d9b887',
    wallShade: '#b99366',
    roof: '#b96f59',
    roofDark: '#9b5b49',
    roofLight: '#cf8267',
    window: '#a9cfc8',
    door: '#8d684b',
    flowerPetal: ['#fff0c6', '#f3b9ad', '#e8c9e2', '#fff6d8'],
    flowerCenter: '#e5ad59',
    stem: '#5d8f5c',
    shadow: 'rgba(59,82,56,0.16)',
    outline: 'rgba(70,98,65,0.35)'
  };

  function polygon(ctx, points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      ctx.lineTo(points[index].x, points[index].y);
    }
    ctx.closePath();
  }

  function fillPolygon(ctx, points, fill, stroke, lineWidth) {
    polygon(ctx, points);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  }

  function fillEllipse(ctx, x, y, rx, ry, fill, stroke, lineWidth) {
    ctx.beginPath();
    if (ctx.ellipse) {
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    } else {
      ctx.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2);
    }
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 1;
      ctx.stroke();
    }
  }

  function diamondPoints(x, y, hw, hh, scale) {
    const factor = scale === undefined ? 1 : scale;
    return [
      { x, y: y - hh * factor },
      { x: x + hw * factor, y },
      { x, y: y + hh * factor },
      { x: x - hw * factor, y }
    ];
  }

  function drawCloud(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    fillEllipse(ctx, 0, 0, 30, 10, PALETTE.cloud);
    fillEllipse(ctx, -12, -4, 15, 13, PALETTE.cloud);
    fillEllipse(ctx, 8, -6, 18, 15, PALETTE.cloud);
    ctx.restore();
  }

  function drawBackdrop(ctx, width, height) {
    ctx.save();
    if (ctx.createLinearGradient) {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, PALETTE.skyTop);
      gradient.addColorStop(1, PALETTE.skyBottom);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = PALETTE.skyTop;
    }
    ctx.fillRect(0, 0, width, height);

    if (ctx.createRadialGradient) {
      const glow = ctx.createRadialGradient(width * 0.83, height * 0.22, 3, width * 0.83, height * 0.22, 42);
      glow.addColorStop(0, 'rgba(246,216,141,0.55)');
      glow.addColorStop(1, 'rgba(246,216,141,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(width * 0.83 - 44, height * 0.22 - 44, 88, 88);
    }

    fillEllipse(ctx, width * 0.83, height * 0.22, 17, 17, PALETTE.sun);
    drawCloud(ctx, width * 0.18, height * 0.22, 0.9);
    drawCloud(ctx, width * 0.56, height * 0.14, 0.65);
    ctx.restore();
  }

  function drawGrassDetails(ctx, command, hw, hh) {
    const spots = [
      [-0.55, -0.05], [-0.2, -0.42], [0.35, -0.22],
      [0.5, 0.12], [0.05, 0.42], [-0.38, 0.28]
    ];
    ctx.strokeStyle = PALETTE.leafDark;
    ctx.lineWidth = 1;
    for (let index = 0; index < spots.length; index += 1) {
      if ((command.variant + index) % 3 === 0) continue;
      const [px, py] = spots[index];
      if (Math.abs(px) + Math.abs(py) > 0.78) continue;
      const x = command.x + px * hw;
      const y = command.y + py * hh;
      ctx.beginPath();
      ctx.moveTo(x - 2, y + 2);
      ctx.lineTo(x, y - 3 - (index % 2));
      ctx.lineTo(x + 2, y + 1);
      ctx.stroke();
    }
  }

  function drawPathDetails(ctx, command, hw, hh) {
    fillPolygon(ctx, diamondPoints(command.x, command.y, hw, hh, 0.62), PALETTE.pathInner);
    const pebbles = [[-0.35, 0.08], [0.2, -0.25], [0.34, 0.22], [-0.1, 0.34]];
    for (let index = 0; index < pebbles.length; index += 1) {
      if ((command.variant + index) % 4 === 0) continue;
      const [px, py] = pebbles[index];
      fillEllipse(
        ctx,
        command.x + px * hw,
        command.y + py * hh,
        2.5,
        1.4,
        'rgba(151,126,91,0.35)'
      );
    }
  }

  function drawPondDetails(ctx, command, hw, hh) {
    fillPolygon(
      ctx,
      diamondPoints(command.x, command.y + 1, hw, hh, 0.72),
      'rgba(255,255,255,0.12)'
    );
    fillEllipse(ctx, command.x - 8, command.y - 1, 9, 4, 'rgba(214,239,228,0.55)');
    ctx.strokeStyle = PALETTE.waterInner;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse
      ? ctx.ellipse(command.x + 7, command.y + 3, 8, 3.5, 0, 0.15, Math.PI * 1.2)
      : ctx.arc(command.x + 7, command.y + 3, 6, 0.15, Math.PI * 1.2);
    ctx.stroke();
    fillEllipse(ctx, command.x + 10, command.y - 4, 5, 2.5, '#7ca96d');
  }

  function drawTile(ctx, command, tile) {
    const t = coords.normalizeTile(tile);
    const hw = t.width / 2;
    const hh = t.height / 2;
    const depth = coords.TILE_SIDE_DEPTH;
    const x = command.x;
    const y = command.y;

    const sideFill = command.type === 'pond'
      ? PALETTE.waterSide
      : command.type === 'path' ? PALETTE.pathSide : PALETTE.grassSide;
    const topColors = command.type === 'pond'
      ? PALETTE.water
      : command.type === 'path' ? PALETTE.path : PALETTE.grass;
    const topFill = topColors[command.variant % topColors.length];
    const edge = command.type === 'pond' ? PALETTE.waterSide : PALETTE.grassEdge;

    fillPolygon(ctx, [
      { x: x - hw, y },
      { x, y: y + hh },
      { x, y: y + hh + depth },
      { x: x - hw, y: y + depth }
    ], sideFill);
    fillPolygon(ctx, [
      { x, y: y + hh },
      { x: x + hw, y },
      { x: x + hw, y: y + depth },
      { x, y: y + hh + depth }
    ], sideFill);
    fillPolygon(ctx, diamondPoints(x, y, hw, hh), topFill, edge, 1);

    if (command.type === 'grass') drawGrassDetails(ctx, command, hw, hh);
    if (command.type === 'path') drawPathDetails(ctx, command, hw, hh);
    if (command.type === 'pond') drawPondDetails(ctx, command, hw, hh);
  }

  function drawShadow(ctx, x, y, rx, ry) {
    fillEllipse(ctx, x, y, rx, ry, PALETTE.shadow);
  }

  function foliageShape(ctx, x, y, rx, ry, fill) {
    const points = [
      { x: x - rx, y: y + ry * 0.2 },
      { x: x - rx * 0.85, y: y - ry * 0.55 },
      { x: x - rx * 0.35, y: y - ry },
      { x: x + rx * 0.4, y: y - ry * 0.9 },
      { x: x + rx * 0.9, y: y - ry * 0.4 },
      { x: x + rx, y: y + ry * 0.25 },
      { x: x + rx * 0.6, y: y + ry * 0.8 },
      { x: x - rx * 0.55, y: y + ry * 0.85 }
    ];
    fillPolygon(ctx, points, fill, PALETTE.leafDark, 1);
  }

  function drawTree(ctx, command) {
    const x = command.x;
    const y = command.y;
    const lean = (command.variant % 3) - 1;

    drawShadow(ctx, x + 2, y + 2, 22, 7);
    fillPolygon(ctx, [
      { x: x - 5, y },
      { x: x - 7 + lean, y: y - 34 },
      { x: x + 4 + lean, y: y - 34 },
      { x: x + 7, y }
    ], PALETTE.trunk, PALETTE.trunkShade, 1);
    fillPolygon(ctx, [
      { x: x + 1 + lean, y: y - 34 },
      { x: x + 4 + lean, y: y - 34 },
      { x: x + 7, y },
      { x: x + 3, y }
    ], PALETTE.trunkShade);

    foliageShape(ctx, x - 14, y - 45 + lean, 18, 17, PALETTE.leafDark);
    foliageShape(ctx, x + 13, y - 46 - lean, 18, 17, PALETTE.leafDark);
    foliageShape(ctx, x + lean, y - 62, 23, 19, PALETTE.leafMid);
    foliageShape(ctx, x - 2 + lean, y - 49, 25, 18, PALETTE.leafLight);
    fillEllipse(ctx, x - 9 + lean, y - 61, 6, 3, PALETTE.leafHighlight);
    fillEllipse(ctx, x + 8 + lean, y - 52, 4, 2.5, PALETTE.leafHighlight);
  }

  function drawHouse(ctx, command) {
    const x = command.x;
    const y = command.y;

    drawShadow(ctx, x + 2, y + 5, 35, 10);

    fillPolygon(ctx, [
      { x: x - 28, y: y - 14 },
      { x: x + 2, y: y - 28 },
      { x: x + 2, y: y - 3 },
      { x: x - 28, y: y + 11 }
    ], PALETTE.wallFront, PALETTE.wallShade, 1);
    fillPolygon(ctx, [
      { x: x + 2, y: y - 28 },
      { x: x + 32, y: y - 15 },
      { x: x + 32, y: y + 9 },
      { x: x + 2, y: y - 3 }
    ], PALETTE.wallSide, PALETTE.wallShade, 1);

    fillPolygon(ctx, [
      { x: x - 34, y: y - 38 },
      { x: x + 2, y: y - 56 },
      { x: x + 2, y: y - 40 },
      { x: x - 34, y: y - 22 }
    ], PALETTE.roof, PALETTE.roofDark, 1.5);
    fillPolygon(ctx, [
      { x: x + 2, y: y - 56 },
      { x: x + 36, y: y - 40 },
      { x: x + 36, y: y - 23 },
      { x: x + 2, y: y - 40 }
    ], PALETTE.roofDark, PALETTE.roofDark, 1.5);
    fillPolygon(ctx, [
      { x: x - 30, y: y - 37 },
      { x: x + 1, y: y - 53 },
      { x: x + 1, y: y - 50 },
      { x: x - 30, y: y - 34 }
    ], PALETTE.roofLight);

    fillPolygon(ctx, [
      { x: x - 19, y: y - 15 },
      { x: x - 8, y: y - 20 },
      { x: x - 8, y: y - 4 },
      { x: x - 19, y: y + 2 }
    ], PALETTE.door, PALETTE.wallShade, 1);
    fillEllipse(ctx, x - 13, y - 7, 1.4, 1.4, '#e8c879');

    fillPolygon(ctx, [
      { x: x + 10, y: y - 25 },
      { x: x + 24, y: y - 19 },
      { x: x + 24, y: y - 9 },
      { x: x + 10, y: y - 15 }
    ], PALETTE.window, '#fff0cf', 2);
    ctx.strokeStyle = '#fff0cf';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 17, y - 22);
    ctx.lineTo(x + 17, y - 12);
    ctx.stroke();

    fillPolygon(ctx, [
      { x: x + 16, y: y - 55 },
      { x: x + 24, y: y - 51 },
      { x: x + 24, y: y - 38 },
      { x: x + 16, y: y - 42 }
    ], PALETTE.roofDark, PALETTE.wallShade, 1);
    fillPolygon(ctx, [
      { x: x + 16, y: y - 55 },
      { x: x + 24, y: y - 51 },
      { x: x + 24, y: y - 49 },
      { x: x + 16, y: y - 53 }
    ], PALETTE.roofLight);
  }

  function drawFlower(ctx, x, y, color, size) {
    for (let petal = 0; petal < 5; petal += 1) {
      const angle = (petal / 5) * Math.PI * 2;
      fillEllipse(
        ctx,
        x + Math.cos(angle) * size,
        y + Math.sin(angle) * size,
        size * 0.75,
        size * 0.6,
        color
      );
    }
    fillEllipse(ctx, x, y, size * 0.55, size * 0.55, PALETTE.flowerCenter);
  }

  function drawFlowers(ctx, command) {
    const positions = [[-13, -4], [0, -15], [12, -7], [4, 2]];
    const color = PALETTE.flowerPetal[command.variant % PALETTE.flowerPetal.length];

    drawShadow(ctx, command.x, command.y + 2, 17, 5);
    ctx.strokeStyle = PALETTE.stem;
    ctx.lineWidth = 1.4;
    for (let index = 0; index < positions.length; index += 1) {
      if ((command.variant + index) % 5 === 0) continue;
      const [dx, dy] = positions[index];
      const x = command.x + dx;
      const y = command.y + dy;
      ctx.beginPath();
      ctx.moveTo(x, command.y + 1);
      ctx.lineTo(x, y + 4);
      ctx.stroke();
      drawFlower(ctx, x, y, color, 3.2);
    }
  }

  function drawBush(ctx, command) {
    const x = command.x;
    const y = command.y;
    drawShadow(ctx, x, y + 2, 19, 6);
    foliageShape(ctx, x - 9, y - 9, 14, 12, PALETTE.leafDark);
    foliageShape(ctx, x + 9, y - 10, 13, 12, PALETTE.leafMid);
    foliageShape(ctx, x, y - 16, 15, 12, PALETTE.leafLight);
    fillEllipse(ctx, x - 5, y - 18, 4, 2, PALETTE.leafHighlight);
  }

  function drawReeds(ctx, command) {
    const x = command.x;
    const y = command.y;
    const offsets = [-11, -2, 8];
    drawShadow(ctx, x, y + 2, 17, 4);
    ctx.strokeStyle = PALETTE.stem;
    ctx.lineWidth = 1.5;
    for (let index = 0; index < offsets.length; index += 1) {
      const dx = offsets[index];
      const top = y - 21 - ((command.variant + index) % 3) * 3;
      ctx.beginPath();
      ctx.moveTo(x + dx, y + 1);
      ctx.lineTo(x + dx - 1, y - 12);
      ctx.lineTo(x + dx + 1, top);
      ctx.stroke();
      fillEllipse(ctx, x + dx + 1, top + 3, 2.2, 5, '#a97c55');
    }
  }

  function drawFence(ctx, command) {
    const x = command.x;
    const y = command.y;
    drawShadow(ctx, x, y + 3, 24, 5);
    fillPolygon(ctx, [
      { x: x - 24, y: y - 5 }, { x: x + 21, y: y - 16 },
      { x: x + 23, y: y - 13 }, { x: x - 22, y: y - 2 }
    ], '#d6bd8b', PALETTE.wallShade, 1);
    fillPolygon(ctx, [
      { x: x - 24, y: y - 12 }, { x: x + 21, y: y - 23 },
      { x: x + 23, y: y - 20 }, { x: x - 22, y: y - 9 }
    ], '#e0c99d', PALETTE.wallShade, 1);
    for (const dx of [-20, 0, 19]) {
      const postY = y - dx * 0.25;
      fillPolygon(ctx, [
        { x: x + dx - 3, y: postY - 14 },
        { x: x + dx + 3, y: postY - 16 },
        { x: x + dx + 3, y: postY + 3 },
        { x: x + dx - 3, y: postY + 5 }
      ], '#c8a974', PALETTE.wallShade, 1);
    }
  }

  function drawObject(ctx, command) {
    switch (command.kind) {
      case 'tree': drawTree(ctx, command); break;
      case 'house': drawHouse(ctx, command); break;
      case 'flowers': drawFlowers(ctx, command); break;
      case 'bush': drawBush(ctx, command); break;
      case 'reeds': drawReeds(ctx, command); break;
      case 'fence': drawFence(ctx, command); break;
      default: break;
    }
  }

  const api = {
    PALETTE,
    drawBackdrop,
    drawTile,
    drawObject,
    drawWorld(ctx, scene) {
      for (const command of scene.commands) {
        if (command.layer === 'ground') {
          api.drawTile(ctx, command, scene.tile);
        } else if (command.layer === 'object') {
          api.drawObject(ctx, command, scene.tile);
        }
      }
    }
  };

  return api;
});
