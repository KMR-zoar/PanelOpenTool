let canvas,
  drawLine,
  isDrawing = false,
  startPoint;
let currentMode = "create";
let splitHistory = [];
let isImageLoaded = false;

const THEMES = [
  { fill: "rgba(255,182,193,1)", stroke: "#da4f94" },
  { fill: "rgba(0,255,255,1)", stroke: "#09abad" },
  { fill: "rgb(21, 233, 32)", stroke: "#297a09" },
  { fill: "rgba(0,0,0,1)", stroke: "#ffffff" },
  { fill: "rgba(255,255,255,1)", stroke: "#000000" },
];
let currentThemeIndex = 0;

window.onload = () => {
  canvas = new fabric.Canvas("mainCanvas", { selection: false });
  canvas.on("mouse:down", onMouseDown);
  canvas.on("mouse:move", onMouseMove);
  canvas.on("mouse:up", onMouseUp);

  // 文字選択時の削除ボタン表示制御
  canvas.on("selection:created", checkSelection);
  canvas.on("selection:updated", checkSelection);
  canvas.on("selection:cleared", () => {
    document.getElementById("btnDeleteText").style.display = "none";
  });

  if (localStorage.getItem("xTemplate")) {
    document.getElementById("xText").value = localStorage.getItem("xTemplate");
  }
};

function checkSelection(e) {
  if (
    currentMode === "create" &&
    e.selected &&
    e.selected[0].type === "textbox"
  ) {
    document.getElementById("btnDeleteText").style.display = "inline-flex";
  }
}

// 1. 文字削除機能
function deleteSelectedText() {
  const activeObj = canvas.getActiveObject();
  if (activeObj && activeObj.type === "textbox") {
    canvas.remove(activeObj);
    canvas.discardActiveObject();
  }
}

// 2. 画像読み込みと見切れ防止(完全フィット)
document.getElementById("imageUpload").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  alert(
    "【お知らせ】\n端末の負荷を軽減するため、編集中は画面サイズに合わせて表示されます。\n画像保存時には「長辺1500pxの高画質」で出力されます！\n\n※企画終了後、全て開いた際は元のファイルを投稿してください！",
  );

  const wrapper = document.getElementById("canvasWrapper");
  const rect = wrapper.getBoundingClientRect();
  const maxWidth = rect.width - 20;
  const maxHeight = rect.height - 20;

  const reader = new FileReader();
  reader.onload = function (f) {
    fabric.Image.fromURL(f.target.result, function (img) {
      let w = img.width,
        h = img.height;
      // 画面領域に完全に収まるようアスペクト比を維持して計算
      if (w > maxWidth || h > maxHeight) {
        const ratio = Math.min(maxWidth / w, maxHeight / h);
        w = w * ratio;
        h = h * ratio;
      }
      canvas.setWidth(w);
      canvas.setHeight(h);
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
        scaleX: w / img.width,
        scaleY: h / img.height,
      });
      document.getElementById("placeholder").style.display = "none";
      isImageLoaded = true;
      resetPanels();
    });
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

function createPolygon(points) {
  const theme = THEMES[currentThemeIndex];
  // 3. 透過度の制御 (作成時は0.6、オープン時は1.0)
  const op = currentMode === "create" ? 0.6 : 1.0;
  return new fabric.Polygon(points, {
    fill: theme.fill,
    stroke: theme.stroke,
    strokeWidth: 5,
    opacity: op,
    selectable: false,
    evented: true,
    objectCaching: false,
    originX: "left",
    originY: "top",
  });
}

// 4. 全消去機能 (テキストも削除)
function resetPanels() {
  if (!isImageLoaded) return;
  canvas.getObjects("polygon").forEach((obj) => canvas.remove(obj));
  canvas.getObjects("textbox").forEach((obj) => canvas.remove(obj));
  splitHistory = [];
  const w = canvas.getWidth(),
    h = canvas.getHeight();
  const p = createPolygon([
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]);
  canvas.add(p);
  canvas.sendToBack(p);
  canvas.renderAll();
}

// --- スワイプ分割アルゴリズム ---
function onMouseDown(o) {
  if (!isImageLoaded) return;

  // === 作成モードの時の処理 (線引き) ===
  if (currentMode === "create") {
    if (canvas.getActiveObject() && canvas.getActiveObject().type === "textbox")
      return;
    isDrawing = true;
    const pointer = canvas.getPointer(o.e);
    startPoint = { x: pointer.x, y: pointer.y };
    drawLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
      stroke: "#ff0000",
      strokeWidth: 5,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
    });
    canvas.add(drawLine);
  }

  // === オープンモードの時の処理 (パネル開閉) ===
  else if (currentMode === "open") {
    // ライブラリの判定(o.target)に頼らず、タップした正確なピクセル座標を取得
    const pointer = canvas.getPointer(o.e);
    const polygons = canvas.getObjects("polygon");

    let clickedPolygon = null;
    // 重なっている場合は上のパネルを優先するため、逆順でループ
    for (let i = polygons.length - 1; i >= 0; i--) {
      // 自前の数学計算で、座標がポリゴンの内側にあるか確実に判定する
      if (isPointInPolygon(pointer, polygons[i].points)) {
        clickedPolygon = polygons[i];
        break;
      }
    }

    if (clickedPolygon) {
      const isOpening = clickedPolygon.opacity !== 0; // 1.0なら開く(0にする)
      clickedPolygon.set({ opacity: isOpening ? 0 : 1.0 });

      // 紐づいたテキストも表示/非表示を切り替え
      if (clickedPolygon.attachedTexts) {
        clickedPolygon.attachedTexts.forEach((t) =>
          t.set({ visible: !isOpening }),
        );
      }
      canvas.renderAll();
    }
  }
}

function onMouseMove(o) {
  if (!isDrawing) return;
  const pointer = canvas.getPointer(o.e);
  drawLine.set({ x2: pointer.x, y2: pointer.y });
  canvas.renderAll();
}

function onMouseUp(o) {
  if (!isDrawing) return;
  isDrawing = false;
  const pointer = canvas.getPointer(o.e);
  const endPoint = { x: pointer.x, y: pointer.y };
  canvas.remove(drawLine);

  if (Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) < 20) {
    canvas.renderAll();
    return;
  }
  saveHistory();
  processSplit(startPoint, endPoint);
}

// 5. 分割線分の挙動 (触れたポリゴンだけを切断し既存線分で止める)
function processSplit(p1, p2) {
  const polygons = canvas.getObjects("polygon");
  let splitOccurred = false;

  // 線分(p1,p2)がポリゴンと交差または包含しているか判定
  function isTargetPolygon(poly) {
    const pts = poly.points;
    if (isPointInPolygon(p1, pts) || isPointInPolygon(p2, pts)) return true;
    for (let i = 0; i < pts.length; i++) {
      if (doLineSegmentsIntersect(p1, p2, pts[i], pts[(i + 1) % pts.length]))
        return true;
    }
    return false;
  }

  polygons.forEach((poly) => {
    if (isTargetPolygon(poly)) {
      const result = splitPolygonByLine(poly.points, p1, p2);
      if (result) {
        canvas.remove(poly);
        const newPoly1 = createPolygon(result[0]);
        const newPoly2 = createPolygon(result[1]);
        canvas.add(newPoly1, newPoly2);
        canvas.sendToBack(newPoly1);
        canvas.sendToBack(newPoly2);
        splitOccurred = true;
      }
    }
  });

  if (!splitOccurred) splitHistory.pop();
  else canvas.getObjects("textbox").forEach((t) => canvas.bringToFront(t));
  canvas.renderAll();
}

// 線分の交差判定計算
function doLineSegmentsIntersect(p1, p2, q1, q2) {
  const cross = (a, b, c) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const cp1 = cross(p1, p2, q1),
    cp2 = cross(p1, p2, q2);
  const cp3 = cross(q1, q2, p1),
    cp4 = cross(q1, q2, p2);
  return cp1 * cp2 < 0 && cp3 * cp4 < 0;
}

function splitPolygonByLine(vertices, p1, p2) {
  const a = p2.y - p1.y,
    b = p1.x - p2.x,
    c = p2.x * p1.y - p1.x * p2.y;
  const poly1 = [],
    poly2 = [];
  const getSide = (p) => {
    const val = a * p.x + b * p.y + c;
    return Math.abs(val) < 1e-4 ? 0 : val > 0 ? 1 : -1;
  };

  for (let i = 0; i < vertices.length; i++) {
    const curr = vertices[i],
      next = vertices[(i + 1) % vertices.length];
    const currSide = getSide(curr),
      nextSide = getSide(next);
    if (currSide >= 0) poly1.push(curr);
    if (currSide <= 0) poly2.push(curr);

    if (currSide * nextSide < 0) {
      const a2 = next.y - curr.y,
        b2 = curr.x - next.x,
        c2 = next.x * curr.y - curr.x * next.y;
      const det = a * b2 - a2 * b;
      if (det !== 0) {
        const intersection = {
          x: (b * c2 - b2 * c) / det,
          y: (a2 * c - a * c2) / det,
        };
        poly1.push(intersection);
        poly2.push(intersection);
      }
    }
  }
  if (poly1.length > 2 && poly2.length > 2) return [poly1, poly2];
  return null;
}

function isPointInPolygon(point, vs) {
  let x = point.x,
    y = point.y,
    inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let intersect =
      vs[i].y > y != vs[j].y > y &&
      x < ((vs[j].x - vs[i].x) * (y - vs[i].y)) / (vs[j].y - vs[i].y) + vs[i].x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function saveHistory() {
  const state = canvas
    .getObjects("polygon")
    .map((p) => p.points.map((pt) => ({ x: pt.x, y: pt.y })));
  splitHistory.push(state);
}
function undoSplit() {
  if (splitHistory.length === 0) return;
  const prevState = splitHistory.pop();
  canvas.getObjects("polygon").forEach((obj) => canvas.remove(obj));
  prevState.forEach((points) => {
    const p = createPolygon(points);
    canvas.add(p);
    canvas.sendToBack(p);
  });
  canvas.getObjects("textbox").forEach((t) => canvas.bringToFront(t));
  canvas.renderAll();
}

function addText() {
  if (!isImageLoaded) return;
  const fSize = Math.max(20, Math.floor(canvas.getWidth() * 0.08));
  const text = new fabric.Textbox("テキスト", {
    left: canvas.getWidth() / 2,
    top: canvas.getHeight() / 2,
    originX: "center",
    originY: "center",
    fontSize: fSize,
    fill: "#ffffff",
    fontWeight: "bold",
    stroke: "#000000",
    strokeWidth: 2,
    paintFirst: "stroke",
    cornerColor: "#2563eb",
    cornerSize: 12,
    transparentCorners: false,
  });
  canvas.add(text);
  canvas.setActiveObject(text);
}

function changeTheme() {
  currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
  const theme = THEMES[currentThemeIndex];
  canvas
    .getObjects("polygon")
    .forEach((p) => p.set({ fill: theme.fill, stroke: theme.stroke }));
  canvas.renderAll();
}

function switchMode(mode) {
  if (mode === currentMode || !isImageLoaded) return;

  if (mode === "create") {
    const openPanels = canvas
      .getObjects("polygon")
      .filter((p) => p.opacity === 0);
    if (openPanels.length > 0) {
      if (
        !confirm(
          "作成モードに戻ると、開いているパネルが全て閉じられます。よろしいですか？",
        )
      )
        return;
    }
    currentMode = "create";
    document.body.className = "mode-create";
    document.getElementById("tabCreate").classList.add("active");
    document.getElementById("tabOpen").classList.remove("active");

    // パネルを透過0.6にし、テキストを編集可能にする
    canvas.getObjects("polygon").forEach((p) => p.set({ opacity: 0.6 }));
    canvas
      .getObjects("textbox")
      .forEach((t) =>
        t.set({ selectable: true, evented: true, visible: true }),
      );
  } else {
    currentMode = "open";
    document.body.className = "mode-open";
    document.getElementById("tabOpen").classList.add("active");
    document.getElementById("tabCreate").classList.remove("active");
    canvas.discardActiveObject();

    // パネルを完全不透明(1.0)にし、テキストを紐付ける
    const texts = canvas.getObjects("textbox");
    const polygons = canvas.getObjects("polygon");
    polygons.forEach((p) => {
      p.set({ opacity: 1.0 });
      p.attachedTexts = [];
    });

    texts.forEach((t) => {
      t.set({ selectable: false, evented: false });
      const center = t.getCenterPoint();
      for (let p of polygons) {
        if (isPointInPolygon(center, p.points)) {
          p.attachedTexts.push(t);
          break;
        }
      }
    });
  }
  canvas.renderAll();
}

// 6. 画像保存(1500px 高解像度出力)
function downloadImage() {
  if (!isImageLoaded) return;
  canvas.discardActiveObject();
  canvas.renderAll();

  const currentLong = Math.max(canvas.getWidth(), canvas.getHeight());
  const targetMax = 1500;
  const mult = targetMax / currentLong;

  const dataURL = canvas.toDataURL({ format: "png", multiplier: mult });
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = `panel_${new Date().getTime()}.png`;
  a.click();
}

function postToX() {
  const text = localStorage.getItem("xTemplate") || "";
  window.open(
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
    "_blank",
  );
}

function openSettings() {
  document.getElementById("settingsModal").style.display = "flex";
}
function closeSettings() {
  document.getElementById("settingsModal").style.display = "none";
}
function saveSettings() {
  localStorage.setItem("xTemplate", document.getElementById("xText").value);
  closeSettings();
}
