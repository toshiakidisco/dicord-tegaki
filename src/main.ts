import htmlWindow from "raw-loader!./window.html";
import htmlButtonOpen from "raw-loader!./button-open.html";

import TegakiCanvas, { PenMode } from "./tegaki-canvas";
import { parseHtml, Outlets } from "./dom";
import { ObservableColor, ObservableValue } from "./observable-value";
import Color from "./color";
import ColorPicker from "./color-picker";
import SizeSelector from "./size-selector";
import Selector from "./selector";
import { clamp } from "./tools";


const DEFAULT_CANVAS_WIDTH = 344;
const DEFAULT_CANVAS_HEIGHT = 135;

const MIN_CANVAS_WIDTH = 344;
const MIN_CANVAS_HEIGHT = 135;

/**
 * キャンバスとウィンドウの横幅の差
 */
const WINDOW_CANVAS_PADDING_H = 84;
const WINDOW_CANVAS_PADDING_V = 73;


type CanvasInitialState = {
  width: number;
  height: number;
  penSize: number;
  foreColor: Color;
  backgroundColor: Color;
};

const canvasInitialState: CanvasInitialState = {
  width: DEFAULT_CANVAS_WIDTH,
  height: DEFAULT_CANVAS_HEIGHT,
  penSize: 4,
  foreColor: new Color(128, 0, 0),
  backgroundColor: new Color(240, 224, 214),
}

class State {
  penMode: ObservableValue<PenMode> = new ObservableValue("pen");
  penSize: ObservableValue<number> = new ObservableValue(4);
  foreColor: ObservableColor = new ObservableColor(128, 0, 0);;
  backgroundColor: ObservableColor = new ObservableColor(240, 224, 214);
}

class DiscordTegaki {
  private _outlets: Outlets;
  private _canvas: TegakiCanvas;
  private _state: State;

  private _paletteForeColor: ColorPicker;
  private _paletteBackgroundColor: ColorPicker;
  private _palettePenSize: SizeSelector;

  private _window: HTMLElement;

  constructor() {
    this._state = new State();
    this._outlets = {};

    this._window = parseHtml(htmlWindow, this, this._outlets);
    parseHtml(htmlButtonOpen, this, this._outlets);

    this._canvas = new TegakiCanvas({
      width: DEFAULT_CANVAS_WIDTH,
      height: DEFAULT_CANVAS_HEIGHT,
      foreColor: new Color(128, 0, 0),
      backgroundColor: new Color(240, 224, 214),
    });
    this._outlets["area-draw"].appendChild(this._canvas.canvas);

    document.body.appendChild(this._outlets["window"]);
    document.body.appendChild(this._outlets["button-open"]);

    this._paletteForeColor = new ColorPicker();
    this._paletteBackgroundColor = new ColorPicker();
    this._palettePenSize = new SizeSelector(this._state.penSize.value);

    this.resetStatus();
    
    this.init();
    this.bind();
  }

  /**
   * 各イベントリスナー登録
   */
  init() {
    const win = this._window;
    let _activePointer: number | null = null;
    // タイトルバードラッグ処理
    {
      let _dragStartPosition = {x: 0, y: 0};
      let _pointerOffset = {x: 0, y: 0};
      const titlebar = this._outlets["titlebar"];
      titlebar.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (_activePointer != null) {
          return;
        }
        _activePointer = ev.pointerId;
        titlebar.setPointerCapture(_activePointer);

        const rect = win.getBoundingClientRect();
        _dragStartPosition.x = rect.x;
        _dragStartPosition.y = rect.y;
        _pointerOffset.x = ev.clientX - rect.x;
        _pointerOffset.y = ev.clientY - rect.y;
      });
      titlebar.addEventListener("pointermove", (ev: PointerEvent) => {
        if (ev.pointerId != _activePointer) {
          return;
        }
        const newLeft = ev.clientX - _pointerOffset.x;
        const newTop = ev.clientY - _pointerOffset.y;
        win.style.left = `${newLeft}px`;
        win.style.top = `${newTop}px`;
        this.adjustWindow();
      });
      titlebar.addEventListener("pointerup", (ev: PointerEvent) => {
        if (_activePointer == ev.pointerId) {
          titlebar.setPointerCapture(_activePointer);
          _activePointer = null;
        }
      });
      titlebar.addEventListener("pointercancel", (ev: PointerEvent) => {
        if (_activePointer != null) {
          titlebar.setPointerCapture(_activePointer);
        }
        _activePointer = null;
      });
    }
    // リサイズ ドラッグ処理
    {
      const resize = this._outlets["resize"];
      let _selector: Selector | null = null;
      let _initialRect:DOMRect = win.getBoundingClientRect();
      let _pointerOffset = {x: 0, y: 0};
      resize.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (_activePointer != null) {
          return;
        }
        _activePointer = ev.pointerId;
        resize.setPointerCapture(_activePointer);

        _initialRect = win.getBoundingClientRect();
        _pointerOffset.x = ev.clientX - _initialRect.right;
        _pointerOffset.y = ev.clientY - _initialRect.bottom;

        _selector = new Selector();
        _selector.select(
          _initialRect.left, _initialRect.top,
          _initialRect.right, _initialRect.bottom
        )
      });
      resize.addEventListener("pointermove", (ev: PointerEvent) => {
        if (ev.pointerId != _activePointer) {
          return;
        }
        let right = clamp(ev.clientX - _pointerOffset.x, 0, window.innerWidth);
        let bottom = clamp(ev.clientY - _pointerOffset.y, 0, window.innerHeight);
        // 右下座標の増量
        let dw = right - _initialRect.right;
        let dh = bottom - _initialRect.bottom;
        // リサイズ後のキャンバスサイズの計算
        let cw = Math.max(
            this._canvas.width + dw/this._canvas.scale,
            MIN_CANVAS_WIDTH
        ) | 0;
        let ch = Math.max(
            this._canvas.height + dh/this._canvas.scale,
            MIN_CANVAS_HEIGHT
        ) | 0;
        // dw, dh　を再計算
        dw = (cw - this._canvas.width)*this._canvas.scale;
        dh = (ch - this._canvas.height)*this._canvas.scale;

        _selector?.select(
          _initialRect.x, _initialRect.y,
          _initialRect.right + dw, _initialRect.bottom + dh
        );

        this.showStatus(`w${this._canvas.width}:h${this._canvas.height} → w${cw}:h${ch}`);
      });
      resize.addEventListener("pointerup", (ev: PointerEvent) => {
        if (_activePointer == ev.pointerId) {
          resize.setPointerCapture(_activePointer);
          _activePointer = null;
        }
        let right = clamp(ev.clientX - _pointerOffset.x, 0, window.innerWidth);
        let bottom = clamp(ev.clientY - _pointerOffset.y, 0, window.innerHeight);
        // 右下座標の増量
        let dw = right - _initialRect.right;
        let dh = bottom - _initialRect.bottom;
        // リサイズ後のキャンバスサイズの計算
        let cw = Math.max(
            this._canvas.width + dw/this._canvas.scale,
            MIN_CANVAS_WIDTH
        ) | 0;
        let ch = Math.max(
            this._canvas.height + dh/this._canvas.scale,
            MIN_CANVAS_HEIGHT
        ) | 0;
        if (cw != this._canvas.width || ch != this._canvas.height) {
          this._canvas.resize(cw, ch);
        }
        this.resetStatus();
        _selector?.close();
      });
      resize.addEventListener("pointercancel", (ev: PointerEvent) => {
        if (_activePointer != null) {
          resize.setPointerCapture(_activePointer);
        }
        _activePointer = null;
        this.resetStatus();
        _selector?.close();
      });
    }

    window.addEventListener("resize", (ev) => {
      this.adjustWindow();
    });
  }

  /**
   * ObservableValue と View 間のバインド
   */
  bind() {
    // Connect ObservableValue to views
    // PenMode
    this._state.penMode.addObserver(this, "change", (val: PenMode) => {
      for (const name of ["pen", "eracer"]) {
        const icon = this._outlets[`icon-${name}`] as HTMLImageElement;
        const active = val == name ? "active" : "deactive";
        icon.src = chrome.runtime.getURL(`asset/tool-${name}-${active}.png`);
      }

      this._canvas.state.penMode = val;
    });
    this._state.penMode.sync();

    // PenSize
    this._state.penSize.addObserver(this, "change", (val: number) => {
      this._canvas.state.penSize = val;
      this._outlets["tool-size-value"].innerText = val.toString();
    });
    this._state.penSize.sync();

    // Color
    this._state.foreColor.addObserver(this, "change", (value: Color.Immutable) => {
      this._outlets["foreColor"].style.backgroundColor = value.css();
      this._canvas.state.foreColor.set(value);
      this._paletteForeColor.set(value);
    });
    this._state.backgroundColor.addObserver(this, "change", (value: Color.Immutable) => {
      this._outlets["backgroundColor"].style.backgroundColor = value.css();
      this._canvas.state.backgroundColor.set(value);
      this._paletteBackgroundColor.set(value);
    });
    this._state.foreColor.sync();
    this._state.backgroundColor.sync();
    
    // Connect palette to ObservableValue
    this._paletteForeColor.addObserver(this, "change", (c: Color.Immutable) => {
      this._state.foreColor.value = c;
    });
    this._paletteBackgroundColor.addObserver(this, "change", (c: Color.Immutable) => {
      this._state.backgroundColor.value = c;
    });
    this._palettePenSize.addObserver(this, "change", (n: number) => {
      this._state.penSize.value = n;
    });

    
    this._canvas.addObserver(this, "size-changed", () => {
      this.resetStatus();
    })
  }

  private _resetStatusTimer: number = 0;
  /**
   * 一定時間ステータステキストを表示
   */
  showStatus(text: string, duration: number = 3000) {
    this._outlets["status"].innerText = text;
    clearTimeout(this._resetStatusTimer);
    this._resetStatusTimer = window.setTimeout(() => {
      this.resetStatus();
    }, duration);
  }

  /**
   * 標準のステータステキスト
   */
  defaultStatusText() {
    return `w${this._canvas.width}:h${this._canvas.height}　倍率x${this._canvas.scale.toPrecision(2)}`;
  }

  /**
   * ステータステキスト表示の更新
   */
  resetStatus() {
    clearTimeout(this._resetStatusTimer);
    this._outlets["status"].innerText = this.defaultStatusText();
  }

  /**
   * キャンバスを初期状態にリセット
   */
  resetCanvas() {
    this._state.foreColor.value = canvasInitialState.foreColor;
    this._state.backgroundColor.value = canvasInitialState.backgroundColor;
    this._state.penSize.value = canvasInitialState.penSize;
    this._canvas.resize(canvasInitialState.width, canvasInitialState.height);
    this._canvas.clear(false);
  }

  // --------------------------------------------------
  // イベントハンドラ定義
  // --------------------------------------------------

  onClickNew(ev: Event) {
    this.resetCanvas();
  }

  onClickZoomIn(ev: Event) {
    const maxScale = this.maxCanvasScale();
    if (this._canvas.scale >= maxScale ) {
      return;
    }
    this._changeScale(Math.min(this._canvas.scale + 0.5, maxScale));
  }

  onClickZoomOut(ev: Event) {
    if (this._canvas.scale <= 1) {
      return;
    }
    this._changeScale(Math.max(this._canvas.scale - 0.5, 1));
  }

  private _changeScale(newScale: number) {
    const lastScale = this._canvas.scale;
    this._canvas.scale = newScale;
    const dw = (this._canvas.scale - lastScale) * this._canvas.width;
    const dh = (this._canvas.scale - lastScale) * this._canvas.height;
    const rect = this._window.getBoundingClientRect();
    this._window.style.left = `${rect.x - dw/2}px`;
    this._window.style.top = `${rect.y - dh/2}px`;
    this.adjustWindow();

    this.resetStatus();
  }

  onClickOpen(ev: Event) {
    const win = this._window;
    const d = win.style.display;
    if (d != "block") {
      win.style.display = "block";
      win.style.left = `${document.body.clientWidth/2 - win.clientWidth/2}px`;
      win.style.top = `${document.body.clientHeight/2 - win.clientHeight/2}px`;
    }
    else {
      win.style.display = "none";
    }
  }

  onClickClose(ev: Event) {
    this._window.style.display = "none";
  }

  onClickPen(ev: Event) {
    this._state.penMode.value = "pen";
  }

  onClickEracer(ev: Event) {
    this._state.penMode.value = "eracer";
  }

  onClickPenSize(ev: MouseEvent) {
    this._palettePenSize.open(ev.clientX, ev.clientY);
  }

  onClickForeColor(ev: MouseEvent) {
    this._paletteForeColor.open(ev.clientX, ev.clientY);
  }

  onClickBackgroundColor(ev: MouseEvent) {
    this._paletteBackgroundColor.open(ev.clientX, ev.clientY);
  }

  onClickClear(ev: Event) {
    this._canvas.clear();
  }

  onClickFill(ev: Event) {
    this._canvas.fill();
  }

  onClickFlip(ev: Event) {
    this._canvas.flip();
  }

  async onClickCopy(ev: Event): Promise<void> {
    await this._canvas.copyToClipboard();
    this.showStatus("クリップボードにコピーしました");
  }

  onClickUndo(ev: Event) {
    this._canvas.undo();
  }

  onClickRedo(ev: Event) {
    this._canvas.redo();
  }

  onKeydown(ev: KeyboardEvent) {
    // Discord側にイベントを吸われないように
    ev.stopPropagation();

    // Undo & Redo
    if (ev.ctrlKey) {
      if (ev.key == "z") {
        this._canvas.undo();
      }
      else if (ev.key == "y") {
        this._canvas.redo();
      }
      return;
    }
    
    // Change tool
    if (ev.key == "e") {
      this._state.penMode.value = "eracer";
    }
    else if (ev.key == "n") {
      this._state.penMode.value = "pen";
    }
  }

  /**
   * ウィンドウの位置(&キャンバスの倍率)の調整
   */
  adjustWindow() {
    const maxScale = this.maxCanvasScale();
    if (this._canvas.scale > maxScale) {
      this._canvas.scale = maxScale;
    }

    const win = this._window;
    const rect = win.getBoundingClientRect();
    if (rect.x < 0) {
      win.style.left = "0";
    }
    else if (rect.right > window.innerWidth) {
      win.style.left = `${window.innerWidth - win.clientWidth}px`;
    }
    if (rect.y < 0) {
      win.style.top = "0";
    }
    else if (rect.bottom > window.innerHeight) {
      win.style.top = `${window.innerHeight - win.clientHeight}px`;
    }
  }

  /**
   * キャンバスの表示できる最大倍率
   */
  maxCanvasScale() {
    return Math.min(
      (window.innerWidth - WINDOW_CANVAS_PADDING_H)/this._canvas.width,
      (window.innerHeight - WINDOW_CANVAS_PADDING_V)/this._canvas.height
    );
  }
}

if (
  location.href.startsWith("https://discord.com/app") ||
  location.href.startsWith("https://discord.com/channels")
) {
  const app = new DiscordTegaki();
  console.log("[Discord Tegaki]launched");
}