// Hand-drawn 16x16 pixel sprites, baked into tiny canvases at 1x.
window.Sprites = (() => {
  function bake(rows, pal, { flipX = false, flipY = false } = {}) {
    const h = rows.length;
    const w = rows[0].length;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    rows.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const col = pal[ch];
        if (!col) return;
        g.fillStyle = col;
        g.fillRect(flipX ? w - 1 - x : x, flipY ? h - 1 - y : y, 1, 1);
      });
    });
    return c;
  }

  // ---- the honey badger (facing right). w = silver back, k = black body, e = eye, n = nose
  const BADGER_A = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '....oooooo......',
    '..oowwwwwwoo.o..',
    '.owwwwwwwwwwoso.',
    'owsssssssswwwwwo',
    'okkkkkkkkkkkkeko',
    'okkkkkkkkkkkkkkn',
    '.okkkkkkkkkkkko.',
    '..okkkkkkkkkko..',
    '..okko...okko...',
    '..occo...occo...',
    '................',
  ];
  const BADGER_B = [
    ...BADGER_A.slice(0, 13),
    '...okko.okko....',
    '...occo.occo....',
    '................',
  ];
  const badgerPal = {
    o: '#050608', w: '#f3f6f8', s: '#b8ccd8', k: '#1f2633',
    e: '#ffffff', n: '#ff8fa3', c: '#b8ccd8',
  };
  const ghostPal = {
    o: '#06303b', w: '#e6fbff', s: '#80d4ff', k: '#48e1fe',
    e: '#ffffff', n: '#e6fbff', c: '#80d4ff',
  };
  // Belly-up with X eyes.
  const DEAD = BADGER_A.map((r) => r.replace('e', 'x'));
  const deadPal = { ...badgerPal, x: '#ff5c7a' };

  // ---- cobra with raised hood. G = green, g = dark green, y = hood markings, r = eyes
  const COBRA_A = [
    '................',
    '......oooo......',
    '.....oGGGGo.....',
    '....oGGGGGGo....',
    '...oGGrGGrGGo...',
    '...oGGGGGGGGo...',
    '...oGgyyyygGo...',
    '....oGyyyyGo....',
    '.....oGyyGo.....',
    '......oGGo......',
    '......oGGo......',
    '.....oGGo.......',
    '..ooooGGoooo....',
    '.oGGGGGGGGGGGo..',
    '..ooooooooooo...',
    '................',
  ];
  // Second frame: the hood sways one pixel.
  const COBRA_B = COBRA_A.map((r, i) => (i <= 10 ? '.' + r.slice(0, -1) : r));
  const cobraPal = { o: '#06200f', G: '#87fb6b', g: '#3f9a4a', y: '#c8f62e', r: '#ff5c7a' };
  const ghostCobraPal = { o: '#06303b', G: '#a6eaff', g: '#48e1fe', y: '#e6fbff', r: '#ffffff' };

  // ---- honey pot
  const POT = [
    '................',
    '................',
    '.....oooooo.....',
    '....oHHHHHHo....',
    '....oRHRRRRo....',
    '.....oHPPPo.....',
    '....oPPPPPPo....',
    '...oPPPPPPPPo...',
    '...oPwPPPPPPo...',
    '...oPPLLLLPPo...',
    '...oPPLLLLPPo...',
    '...oPPPPPPPPo...',
    '....oPPPPPPo....',
    '.....oooooo.....',
    '................',
    '................',
  ];
  // A gold honey pot (amber is our one non-DBOS color besides danger red): P = gold body,
  // w = shine, H = honey brimming over the rim and dripping, R = the dark neck, L = the band.
  const potPal = { o: '#050608', H: '#ffe27a', R: '#7a4300', P: '#ffb627', L: '#d97400', w: '#fff3c4' };

  // ---- the den: a warm dirt mound with a dark burrow, grass tufts, and a checkered finish
  // flag that flutters between two frames
  const DEN_MOUND = [
    '...p............',
    '...p............',
    '...p............',
    '...p............',
    '...p............',
    '...p........g...',
    '...p.oooooo.g.g.',
    '...ooHHHHHHoo...',
    '..oHHDooooDHHo..',
    '.oHDDoKKKKoDDHo.',
    '.oHDoKKKKKKoDHo.',
    'oHDDoKKKKKKoDDHo',
    'oDDDoKKKKKKoDDDo',
    'oDdDDDDDDDDDDdDo',
    '.oooooooooooooo.',
    '................',
  ];
  // Flag cloth: C = white square, c = ink square, laid out as a checkerboard.
  const DEN_FLAG = [
    ['....xxxxx', '....xxxxx', '....xxxxx'], // flying straight out
    ['....xxxx.', '....xxxxxx', '....xxxx.'], // snapping into a pennant
  ];
  const denWithFlag = (flag) => DEN_MOUND.map((row, y) => {
    if (y > 2) return row;
    return [...row].map((ch, x) => (flag[y][x] === 'x' ? ((x + y) % 2 ? 'c' : 'C') : ch)).join('');
  });
  const denPal = {
    o: '#050608', p: '#b8ccd8', C: '#f3f6f8', c: '#121b2b', g: '#87fb6b',
    H: '#c08a4a', D: '#7a4e24', d: '#55331a', K: '#0a0604',
  };

  const set = (rows, pal) => ({ right: bake(rows, pal), left: bake(rows, pal, { flipX: true }) });
  return {
    badger: [set(BADGER_A, badgerPal), set(BADGER_B, badgerPal)],
    ghost: [set(BADGER_A, ghostPal), set(BADGER_B, ghostPal)],
    dead: { right: bake(DEAD, deadPal, { flipY: true }), left: bake(DEAD, deadPal, { flipY: true, flipX: true }) },
    cobra: [bake(COBRA_A, cobraPal), bake(COBRA_B, cobraPal)],
    ghostCobra: [bake(COBRA_A, ghostCobraPal), bake(COBRA_B, ghostCobraPal)],
    pot: bake(POT, potPal),
    den: DEN_FLAG.map((flag) => bake(denWithFlag(flag), denPal)),
  };
})();
