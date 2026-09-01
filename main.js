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
let isTextEditing = false;
// 編集中のテキストがこの高さ(CSS px)未満まで縮むと、ヘッダーも隠してスペースを確保する
const MIN_EDIT_TEXT_DISPLAY_HEIGHT = 40;

window.onload = () => {
  canvas = new fabric.Canvas("mainCanvas", { selection: false });
  canvas.on("mouse:down", onMouseDown);
  canvas.on("mouse:move", onMouseMove);
  canvas.on("mouse:up", onMouseUp);

  canvas.on("selection:created", checkSelection);
  canvas.on("selection:updated", checkSelection);
  canvas.on("selection:cleared", () => {
    document.getElementById("btnDeleteText").style.display = "none";
  });

  canvas.on("text:editing:entered", () => {
    isTextEditing = true;
    updateEditingLayout();
  });

  canvas.on("text:editing:exited", () => {
    isTextEditing = false;
    document.body.classList.remove("hide-footer", "hide-header", "is-editing-scroll");
    document.getElementById("canvasWrapper").scrollTop = 0;
    fitCanvasToScreen();
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
  });

  canvas.on("object:modified", saveWorkspace);
  canvas.on("text:changed", saveWorkspace);

  // 画面の向きが変わった時やキーボードの表示/非表示に合わせて表示サイズをフィットし直す
  window.addEventListener("resize", updateAppHeight);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateAppHeight);
    window.visualViewport.addEventListener("scroll", updateAppHeight);
  }
  updateAppHeight();

  if (localStorage.getItem("xTemplate")) {
    document.getElementById("xText").value = localStorage.getItem("xTemplate");
  }

  loadWorkspace();
};

// === キーボード表示時の可視領域追従 ===
function updateAppHeight() {
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${h}px`);

  if (isTextEditing) {
    updateEditingLayout();
  } else {
    fitCanvasToScreen();
  }
}

// 文字編集中のレイアウト調整
// 1. フッターを隠す 2. まだ文字が小さければヘッダーも隠す
// 3. それでも高さが足りなければ「拡大」ではなく「幅基準フィット＋スクロール」に切り替える
function updateEditingLayout() {
  if (!isTextEditing) return;

  document.body.classList.add("hide-footer");
  document.body.classList.remove("hide-header", "is-editing-scroll");

  const activeObj = canvas.getActiveObject();
  if (!activeObj) return;

  let ratio = fitCanvasToScreen();
  if (!ratio) return;
  let displayHeight = getEditTextLineHeight(activeObj) * ratio;

  if (displayHeight < MIN_EDIT_TEXT_DISPLAY_HEIGHT) {
    document.body.classList.add("hide-header");
    ratio = fitCanvasToScreen();
    displayHeight = getEditTextLineHeight(activeObj) * ratio;
  }

  if (displayHeight < MIN_EDIT_TEXT_DISPLAY_HEIGHT) {
    // 縦横比を保ったままの縮小では幅まで狭くなってしまうため、
    // 幅は画面いっぱいに使い、高さはスクロールで編集箇所を追う方式にする
    document.body.classList.add("is-editing-scroll");
    ratio = fitCanvasWidthOnly();
    scrollToActiveText(activeObj, ratio);
  }
}

// テキストボックス全体の高さではなく、1行あたりの見やすさ（フォントサイズ）を返す
// 複数行テキストは行数分だけ全体の高さが伸びるため、それを基準にすると誤判定する
function getEditTextLineHeight(obj) {
  return (obj.fontSize || 0) * (obj.scaleY || 1);
}

// 高さは無視し、幅を基準にキャンバスをフィットさせる
function fitCanvasWidthOnly() {
  if (!isImageLoaded) return null;
  const wrapper = document.getElementById("canvasWrapper");
  const rect = wrapper.getBoundingClientRect();
  const maxWidth = Math.max(0, rect.width - 20);

  const logW = canvas.getWidth();
  const logH = canvas.getHeight();
  const ratio = maxWidth / logW;
  const cssW = logW * ratio;
  const cssH = logH * ratio;

  canvas.setDimensions(
    { width: cssW + "px", height: cssH + "px" },
    { cssOnly: true },
  );
  canvas.renderAll();
  return ratio;
}

// 編集中のテキストが画面中央に来るようキャンバスラッパーを縦スクロールさせる
function scrollToActiveText(activeObj, ratio) {
  if (!ratio) return;
  const wrapper = document.getElementById("canvasWrapper");
  const objRect = activeObj.getBoundingRect(true, true);
  const objCenterYCss = (objRect.top + objRect.height / 2) * ratio + 10; // +10: wrapperのpadding分
  wrapper.scrollTop = Math.max(0, objCenterYCss - wrapper.clientHeight / 2);
}

// === 内部解像度と見た目の分離処理 ===
function fitCanvasToScreen() {
  if (!isImageLoaded) return;
  const wrapper = document.getElementById("canvasWrapper");
  const rect = wrapper.getBoundingClientRect();
  const maxWidth = Math.max(0, rect.width - 20);
  const maxHeight = Math.max(0, rect.height - 20);

  // 内部の論理解像度（1500px等）を取得
  const logW = canvas.getWidth();
  const logH = canvas.getHeight();

  // 画面に収まる表示サイズを計算
  const ratio = Math.min(maxWidth / logW, maxHeight / logH);
  const cssW = logW * ratio;
  const cssH = logH * ratio;

  // cssOnly: true を指定して、内部の高画質は維持したまま見た目のサイズだけを縮小する
  canvas.setDimensions(
    {
      width: cssW + "px",
      height: cssH + "px",
    },
    { cssOnly: true },
  );

  canvas.renderAll();
  return ratio;
}

function checkSelection(e) {
  if (
    currentMode === "create" &&
    e.selected &&
    e.selected[0].type === "textbox"
  ) {
    document.getElementById("btnDeleteText").style.display = "inline-flex";
  }
}

function deleteSelectedText() {
  const activeObj = canvas.getActiveObject();
  if (activeObj && activeObj.type === "textbox") {
    canvas.remove(activeObj);
    canvas.discardActiveObject();
    saveWorkspace();
  }
}

document.getElementById("imageUpload").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;
  alert(
    "【お知らせ】\n端末の負荷を軽減するため、編集中は画面サイズに合わせて表示されます。\n画像保存時には「長辺1500pxの高画質」で出力されます！\n\n※企画終了後、全て開いた際は元のファイルを投稿してください！",
  );

  const reader = new FileReader();
  reader.onload = function (f) {
    fabric.Image.fromURL(f.target.result, function (img) {
      // 内部解像度は高画質(最大1500px)で固定する
      const MAX_LOGICAL = 1500;
      let logW = img.width,
        logH = img.height;
      if (logW > MAX_LOGICAL || logH > MAX_LOGICAL) {
        const ratio = Math.min(MAX_LOGICAL / logW, MAX_LOGICAL / logH);
        logW = logW * ratio;
        logH = logH * ratio;
      }

      canvas.setWidth(logW);
      canvas.setHeight(logH);
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
        scaleX: logW / img.width,
        scaleY: logH / img.height,
      });

      document.getElementById("placeholder").style.display = "none";
      isImageLoaded = true;

      fitCanvasToScreen(); // 見た目を画面にフィットさせる
      resetPanels();
    });
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

function createPolygon(points) {
  const theme = THEMES[currentThemeIndex];
  const op = currentMode === "create" ? 0.6 : 1.0;
  // 内部解像度に対する相対的な太さに調整（見た目5px相当）
  const sWidth = Math.max(5, Math.floor(canvas.getWidth() * 0.015));
  return new fabric.Polygon(points, {
    fill: theme.fill,
    stroke: theme.stroke,
    strokeWidth: sWidth,
    opacity: op,
    selectable: false,
    evented: true,
    objectCaching: false,
    originX: "left",
    originY: "top",
  });
}

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
  saveWorkspace();
}

function onMouseDown(o) {
  if (!isImageLoaded) return;

  if (currentMode === "create") {
    // 1. すでにテキストを選択中（操作中）の場合は線を引かない
    if (canvas.getActiveObject() && canvas.getActiveObject().type === "textbox") return;
    
    // 2. 選択されていないテキストを「これから操作しようとタッチした瞬間」も線を引かない
    if (o.target && o.target.type === "textbox") return;
    isDrawing = true;
    const pointer = canvas.getPointer(o.e);
    startPoint = { x: pointer.x, y: pointer.y };

    const sWidth = Math.max(5, Math.floor(canvas.getWidth() * 0.015));
    drawLine = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
      stroke: "#ff0000",
      strokeWidth: sWidth,
      strokeDashArray: [sWidth, sWidth],
      selectable: false,
      evented: false,
    });
    canvas.add(drawLine);
  } else if (currentMode === "open") {
    const pointer = canvas.getPointer(o.e);
    const polygons = canvas.getObjects("polygon");

    let clickedPolygon = null;
    for (let i = polygons.length - 1; i >= 0; i--) {
      if (isPointInPolygon(pointer, polygons[i].points)) {
        clickedPolygon = polygons[i];
        break;
      }
    }

    if (clickedPolygon) {
      const isOpening = clickedPolygon.opacity !== 0;
      clickedPolygon.set({ opacity: isOpening ? 0 : 1.0 });

      if (clickedPolygon.attachedTexts) {
        clickedPolygon.attachedTexts.forEach((t) =>
          t.set({ visible: !isOpening }),
        );
      }
      canvas.renderAll();
      saveWorkspace();
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

function processSplit(p1, p2) {
  const polygons = canvas.getObjects("polygon");
  let splitOccurred = false;

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
  if (splitOccurred) saveWorkspace();
}

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
  saveWorkspace();
}

function addText() {
  if (!isImageLoaded) return;
  const fSize = Math.max(30, Math.floor(canvas.getWidth() * 0.08));
  const tStroke = Math.max(2, Math.floor(canvas.getWidth() * 0.005));

  const text = new fabric.Textbox("テキスト", {
    left: canvas.getWidth() / 2,
    top: canvas.getHeight() / 2,
    originX: "center",
    originY: "center",
    fontSize: fSize,
    fontFamily: '"M PLUS Rounded 1c", sans-serif',
    fill: "#ffffff",
    fontWeight: "bold",
    stroke: "#000000",
    strokeWidth: tStroke,
    paintFirst: "stroke",
    cornerColor: "#2563eb",
    cornerSize: 24,
    padding: 15, 
    transparentCorners: false,
  });
  canvas.add(text);
  canvas.setActiveObject(text);
  saveWorkspace();
}

function changeTheme() {
  currentThemeIndex = (currentThemeIndex + 1) % THEMES.length;
  const theme = THEMES[currentThemeIndex];
  canvas
    .getObjects("polygon")
    .forEach((p) => p.set({ fill: theme.fill, stroke: theme.stroke }));
  canvas.renderAll();
  saveWorkspace();
}

function switchMode(mode, skipConfirm = false) {
  if (mode === currentMode || !isImageLoaded) return;

  if (mode === "create") {
    const openPanels = canvas
      .getObjects("polygon")
      .filter((p) => p.opacity === 0);
    if (openPanels.length > 0 && !skipConfirm) {
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
  if (!skipConfirm) saveWorkspace();
}

function saveWorkspace() {
  if (!isImageLoaded) return;
  try {
    const bgImage = canvas.backgroundImage;
    const bgSrc = bgImage
      ? bgImage.toDataURL({ format: "jpeg", quality: 0.8 })
      : null;

    const state = {
      width: canvas.getWidth(), // 高画質論理サイズ
      height: canvas.getHeight(),
      bgSrc: bgSrc,
      mode: currentMode,
      themeIndex: currentThemeIndex,
      polygons: canvas.getObjects("polygon").map((p) => ({
        points: p.points,
        opacity: p.opacity,
      })),
      texts: canvas.getObjects("textbox").map((t) => ({
        text: t.text,
        left: t.left,
        top: t.top,
        angle: t.angle,
        scaleX: t.scaleX,
        scaleY: t.scaleY,
        width: t.width,
        fontSize: t.fontSize,
        visible: t.visible,
      })),
    };
    localStorage.setItem("panelWorkspace", JSON.stringify(state));
  } catch (e) {
    console.warn("localStorage保存エラー", e);
  }
}

function loadWorkspace() {
  const saved = localStorage.getItem("panelWorkspace");
  if (!saved) return;

  try {
    const state = JSON.parse(saved);
    if (!state.bgSrc) return;

    currentThemeIndex = state.themeIndex || 0;

    fabric.Image.fromURL(state.bgSrc, function (img) {
      canvas.setWidth(state.width);
      canvas.setHeight(state.height);
      canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
        originX: "left",
        originY: "top",
        width: state.width,
        height: state.height,
      });

      state.polygons.forEach((p) => {
        const poly = createPolygon(p.points);
        poly.set({ opacity: p.opacity });
        canvas.add(poly);
        canvas.sendToBack(poly);
      });

      const fSize = Math.max(30, Math.floor(canvas.getWidth() * 0.08));
      const tStroke = Math.max(2, Math.floor(canvas.getWidth() * 0.005));

      state.texts.forEach((t) => {
        const text = new fabric.Textbox(t.text, {
          left: t.left,
          top: t.top,
          originX: "center",
          originY: "center",
          angle: t.angle,
          scaleX: t.scaleX,
          scaleY: t.scaleY,
          width: t.width,
          fontSize: t.fontSize || fSize,
          fontFamily: '"M PLUS Rounded 1c", sans-serif',
          fill: "#ffffff",
          fontWeight: "bold",
          stroke: "#000000",
          strokeWidth: tStroke,
          paintFirst: "stroke",
          cornerColor: "#2563eb",
          cornerSize: 24,
          padding: 15, 
          transparentCorners: false,
          visible: t.visible,
          selectable: state.mode === "create",
          evented: state.mode === "create",
        });
        canvas.add(text);
      });

      isImageLoaded = true;
      document.getElementById("placeholder").style.display = "none";

      fitCanvasToScreen(); // 復元時にも見た目をフィットさせる

      if (state.mode === "open") {
        currentMode = "create";
        switchMode("open", true);
      } else {
        document.body.className = "mode-create";
        document.getElementById("tabCreate").classList.add("active");
        document.getElementById("tabOpen").classList.remove("active");
        canvas.renderAll();
      }
    });
  } catch (e) {
    console.error("ワークスペースの復元に失敗しました", e);
  }
}

async function downloadImage() {
  if (!isImageLoaded) return;
  canvas.discardActiveObject();
  canvas.renderAll();

  // 等倍で出力
  const dataURL = canvas.toDataURL({ format: "png", multiplier: 1 });
  const fileName = `panel_${new Date().getTime()}.png`;

  // Base64 (dataURL) を Blob (ファイルデータ) に変換する処理
  function dataURLtoBlob(dataurl) {
    let arr = dataurl.split(","),
      mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]),
      n = bstr.length,
      u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  const blob = dataURLtoBlob(dataURL);
  const file = new File([blob], fileName, { type: "image/png" });

  // スマホの「共有メニュー（Web Share API）」が使えるかチェック
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "パネル画像",
      });
      // シェアメニューが開いた（または完了した）らここで終了
      return;
    } catch (err) {
      // ユーザーがシェアメニューを閉じた場合などは何もしない
      console.log("シェアをキャンセルしました", err);
      return;
    }
  }

  // PCなど、共有メニューに非対応のブラウザの場合は従来の「ファイルダウンロード」を行う
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = fileName;
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
