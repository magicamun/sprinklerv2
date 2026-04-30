// ---------- Helper functions (oben, außerhalb) ----------
// WORKING 1.2
console.log("TIMELINE FILE LOADED 1.2");

function startOfToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function endOfToday() {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d;
}

const HEADER_ROW_HEIGHT = 22;   // Datum
const TIME_ROW_HEIGHT = 18;   // Uhrzeit
const EVENT_ROW_HEIGHT = 40;   // Zonen / Programme
const HEADER_GAP = 4;

function logBox(label, el) {
    if (!el) {
        console.warn(`[${label}] element missing`);
        return;
    }

    const r = el.getBoundingClientRect();
    console.group(`📐 ${label}`);
    console.log("offsetWidth :", el.offsetWidth);
    console.log("scrollWidth :", el.scrollWidth);
    console.log("clientWidth :", el.clientWidth);
    console.log("rect.width  :", r.width);
    console.log("style.width :", getComputedStyle(el).width);
    console.log("max-width   :", getComputedStyle(el).maxWidth);
    console.log("overflow-x  :", getComputedStyle(el).overflowX);
    console.groupEnd();
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // 32bit
    }
    return Math.abs(hash);
}

function translateState(state) {
    switch (state) {
        case "running": return "Aktiv";
        case "queued": return "Wartet";
        case "done": return "Fertig";
        case "cancelled": return "Abgebrochen";
        default: return state ?? "Unbekannt";
    }
}

function formatTime(d) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatMinutes(min) {
    if (min < 1) return "<1 min";
    return `${Math.round(min)} min`;
}

function getRemainingMinutes(end) {
    return Math.max(0, (end - new Date()) / 60000);
}

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function endOfDay(d) {
    const x = new Date(d);
    x.setHours(24, 0, 0, 0);
    return x;
}

function applyStateStyle(bar, state) {
    switch (state) {
        case "running":
            bar.style.opacity = "1";
            bar.style.boxShadow = "0 0 0 2px rgba(0,0,0,0.25)";
            bar.style.outline = "2px solid rgba(255,255,255,0.6)";
            break;

        case "queued":
            bar.style.opacity = "0.85";
            bar.style.filter = "saturate(0.85)";
            break;

        case "done":
            bar.style.opacity = "0.45";
            bar.style.filter = "saturate(0.7)";
            break;

        case "cancelled":
            bar.style.opacity = "0.7";
            bar.style.backgroundImage =
                "repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0 6px, transparent 6px 12px)";
            break;
        case "skipped":
            bar.style.border = "2px dashed rgba(0,0,0,0.4)";
            bar.style.opacity = "0.8";
            break;
        case "skip":
            bar.style.border = "2px dashed rgba(0,0,0,0.4)";
            bar.style.opacity = "0.8";
            break;
    }
}

function mapSensorEvents(sensorEvents) {
    if (!Array.isArray(sensorEvents)) return [];

    return sensorEvents.map(e => {
        const start = new Date(e.start);
        const end = new Date(e.end);

        return {
            label: e.zone?.name ?? "Unbekannte Zone",
            start,
            end,
            durationMin: (end - start) / 60000,

            program: e.program?.id ?? null,
            programName: e.program?.name ?? null,
            programColor: e.program?.color ?? e.program_color ?? "#9e9e9e",

            policy: e.policy,
            state: e.state,
            slot: e.slot,
            load: e.load ?? 1,
        };
    });
}

function packProgramLanes(events) {
    const programs = new Map();

    for (const e of events) {
        const programId = e.program;
        if (!programs.has(programId)) {
            programs.set(programId, {
                programId,
                programName: e.programName ?? "Unbenannt",
                programColor: e.programColor ?? e.program_color ?? "9e9e9e",
                events: [],
                //        slotCount: 0,
                maxLoad: 1
            });
        }

        programs.get(programId).events.push(e);
    }

    // SlotCount bestimmen
    for (const program of programs.values()) {
        const slots = new Set(
            program.events.map(e => e.slot ?? 0)
        );
        //    program.slotCount = slots.size;
        // 🔥 max load bestimmen
        program.maxLoad = Math.max(
            ...program.events.map(e => (e.slot ?? 0) + (e.load ?? 1))
        );
    }

    return Array.from(programs.values())
        .sort((a, b) => {

            // Manuell immer ans Ende
            if (a.programId === "manual") return 1;
            if (b.programId === "manual") return -1;

            return a.programName.localeCompare(b.programName);
        });
}

// ---------- Custom Card class ----------

class SprinklerTimelineCardBase extends HTMLElement {
    autoScrollToNow() {
        if (!this._timelineStart || !this._timelineEnd) return;
        if (this._autoScrolled) return;

        const now = new Date();

        if (now < this._timelineStart || now > this._timelineEnd) return;

        const totalMs = this._timelineEnd - this._timelineStart;
        const nowRatio = (now - this._timelineStart) / totalMs;

        const scrollWidth = this.timelineLayer.scrollWidth;
        const viewWidth = this.viewport.clientWidth;

        const target =
            nowRatio * scrollWidth - viewWidth * 0.3;

        const maxScroll = scrollWidth - viewWidth;

        this.viewport.scrollLeft = Math.min(
            Math.max(0, target),
            maxScroll
        );

        this._autoScrolled = true;

    }

    setConfig(config) {
        if (!config.entity) {
            console.warn("No entity defined, falling back to sensor.sprinkler_timeline");
        }

        this.config = {
            entity: config.entity ?? "sensor.sprinkler_timeline",
            ...config
        };
    }

    _handleNavigation(action) {
        if (!this._pxPerMinute) return;

        const maxScroll =
            this.timelineLayer.scrollWidth -
            this.viewport.clientWidth;

        const oneDayPx = 24 * 60 * this._pxPerMinute;

        switch (action) {

            case "start":
                this.viewport.scrollTo({ left: 0, behavior: "smooth" });
                break;

            case "end":
                this.viewport.scrollTo({
                    left: maxScroll,
                    behavior: "smooth"
                });
                break;

            case "now":
                this._autoScrolled = false;
                this.autoScrollToNow();
                break;

            case "+1d":
                this.viewport.scrollTo({
                    left: Math.min(
                        this.viewport.scrollLeft + oneDayPx,
                        maxScroll
                    ),
                    behavior: "smooth"
                });
                break;

            case "-1d":
                this.viewport.scrollTo({
                    left: Math.max(
                        this.viewport.scrollLeft - oneDayPx,
                        0
                    ),
                    behavior: "smooth"
                });
                break;
        }
    }

    updateContextDayLabel() {
        const LABEL_WIDTH = 110;

        const referenceX =
            this.viewport.scrollLeft + LABEL_WIDTH;

        const minutes =
            referenceX / this._pxPerMinute;

        const date =
            new Date(
                this._timelineStart.getTime() +
                minutes * 60000
            );

        const dayStart = startOfDay(date);

        this.contextDayLabel.textContent =
            dayStart.toLocaleDateString(undefined, {
                weekday: "short",
                day: "2-digit",
                month: "2-digit"
            });
    }

    updateNowLine() {
        if (!this.nowLine) return;
        if (!this._timelineStart || !this._pxPerMinute) return;

        const now = new Date();

        if (now < this._timelineStart || now > this._timelineEnd) {
            this.nowLine.style.display = "none";
            return;
        }

        const minutes = (now - this._timelineStart) / 60000;
        const x = minutes * this._pxPerMinute;

        this.nowLine.style.display = "block";
        // this.nowLine.style.left = `${x}px`;
        this.nowLine.style.transform = `translateX(${x}px)`;
        this.nowLine.style.height =
            `${this.timelineLayer.offsetHeight}px`;
    }

    connectedCallback() {
        console.log("Timeline connected");

        if (this._connected) return;
        this._connected = true;
        // 🔑 WICHTIG
        this._autoScrolled = false;
        // this._shouldAutoScroll = true;
        this._layoutReady = false;
        this._lastHass = null;


        const title =
            this.config?.title ?? "Sprinkler Timeline";

        console.log(title);
        this.innerHTML = `
            <style>
                :host {
                display: block;
                width: 100%;
                overflow: hidden;
                }

                ha-card {
                overflow: hidden;
                }

                .outer-clip {
                width: 100%;
                overflow: hidden;   /* 🔒 harte Grenze */
                position: relative;
                }
                .card-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                }
            
                .nav-buttons {
                display:flex;
                gap:4px;
                }

                .nav-buttons button {
                cursor:pointer;
                padding:2px 6px;
                }

                #viewport {
                height: auto;
                width: 100%;
                overflow: auto;
                /* overflow-x: auto; */ /* 🔁 NUR HIER */
                /* overflow-y: hidden; */
                position: relative;
                }

                /* 🚀 darf breit sein, aber darf nichts aufblasen */
                #timelineLayer {
                position: absolute;   /* 🔑 EXTREM WICHTIG */
                top: 0;
                left: 0;
                z-index: 0;
                /* height: 100%; */
                /* min-width: 0;    */   /* 🔑 */
                }
                #gridLayer {
                position: absolute;
                top: 0;
                left: 0;
                z-index: 6;
                pointer-events: none;
                }  
                #labelLayer {
                    position: absolute;
                    top: 0;
                    left: 0;
                    z-index: 5;
                    pointer-events: none;
                }
                #contextLayer {
                position: absolute;
                top: 0;
                left: 0;
                z-index: 8;          /* über allem */
                pointer-events: none;
                }
            </style>

            <ha-card>
                <div class="card-header">
                <div>${title}</div>
                <div class="nav-buttons">
                    <button data-nav="start">⏮</button>
                    <button data-nav="-1d">◀</button>
                    <button data-nav="now">●</button>
                    <button data-nav="+1d">▶</button>
                    <button data-nav="end">⏭</button>
                </div>
                <select id="zoom">
                    <option value="3">3h</option>
                    <option value="6">6h</option>
                    <option value="12" selected>12h</option>
                    <option value="24">24h</option>
                </select>
                </div>
                <div class="outer-clip">
                <div id="contextLayer"></div>
                <div id="viewport">
                    <div id="timelineLayer"></div>
                    <div id="gridLayer"></div>
                    <div id="labelLayer"></div>
                </div>
                </div>
            </ha-card>
            `;
        this.timelineLayer = this.querySelector("#timelineLayer");
        this.gridLayer = this.querySelector("#gridLayer");
        this.labelLayer = this.querySelector("#labelLayer");
        this.viewport = this.querySelector("#viewport");
        this._resizeObserver = new ResizeObserver(entries => {

            for (const entry of entries) {

                const width = entry.contentRect.width;

                // 👉 noch keine sinnvolle Größe → ignorieren

                if (!width) return;

                // 👉 keine Änderung → nichts tun

                if (width === this._lastWidth) return;

                this._lastWidth = width;

                console.log("📐 Resize detected:", width);

                // 🔥 wichtig: Hash invalidieren → zwingt Re-Render

                this._lastEventsHash = null;

                requestAnimationFrame(() => {

                    this._render();

                });

            }

        });

        // 👉 beobachten

        this._resizeObserver.observe(this.viewport);
        this.cardEl = this.querySelector("ha-card");
        this.zoomSelect = this.querySelector("#zoom");
        this.labelLayer.innerHTML = "";
        this._minuteTimer = setInterval(() => {
            if (this._timelineStart && this._timelineEnd && this._pxPerMinute) {
                this.updateNowLine();
            }
        }, 60000);
        this.viewport.addEventListener("scroll", () => {
            const x = this.viewport.scrollLeft;
            const y = this.viewport.scrollTop;

            this.labelLayer.style.transform = `translateX(${x}px)`;
            this.gridLayer.style.transform = `translateY(${y}px)`;

            this.updateContextDayLabel();   // <--- HIER
        });

        // 🔑 Initial auto-scroll exactly once
        // this._autoScrolled = false;
        // this._shouldAutoScroll = true;
        const card = this.querySelector("ha-card");

        // to Now()
        // this.zoomSelect.addEventListener("now", (e) => {
        //  this.autoScrollToNow();
        // });

        // Zoom
        this.zoomSelect.addEventListener("change", (e) => {
            this.hoursVisible = Number(e.target.value);
            this._autoScrolled = false;
            // this._shouldAutoScroll = true;
            // 🔥 HASH INVALIDIEREN
            this._lastEventsHash = null;

            if (this._lastHass) {
                this.hass = this._lastHass;
            }
        });
        this.zoomSelect = this.querySelector("#zoom");

        this.querySelector(".nav-buttons")
            .addEventListener("click", (e) => {

                const btn = e.target.closest("button");
                if (!btn) return;

                const action = btn.dataset.nav;

                this._handleNavigation(action);
            });

        this.tooltip = document.createElement("div");
        this.tooltip.style.cssText = `
            position: fixed;
            z-index: 1000;
            pointer-events: none;
            background: rgba(50,50,50,0.95);
            color: #fff;
            font-size: 12px;
            padding: 6px 8px;
            border-radius: 4px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            display: none;
            white-space: nowrap;
            `;
        document.body.appendChild(this.tooltip);


        this.contextLayer = this.querySelector("#contextLayer");

        this.contextDayLabel = document.createElement("div");
        const contextHeight = HEADER_ROW_HEIGHT + TIME_ROW_HEIGHT;
        console.log(contextHeight);
        this.contextDayLabel.style.cssText = `
            position:absolute;
            left:0;
            top:0;
            width: 110px; /* LABEL_WIDTH */
            height:${contextHeight}px;
            line-height:${HEADER_ROW_HEIGHT}px;
            background:#fafafa;
            font-weight:600;
            font-size:12px;
            padding-left:8px;
            box-sizing:border-box;
            `;
        this.contextLayer.style.width = `${this.viewport.clientWidth}px`;
        this.contextLayer.style.height = `${contextHeight}px`;
        this.contextLayer.appendChild(this.contextDayLabel);
    }

    disconnectedCallback() {

        console.log("Timeline disconnected");

        if (this._resizeObserver) {

            this._resizeObserver.disconnect();

        }
    }

    set hass(hass) {
        this._lastHass = hass;

        if (!this._connected || !this.viewport) return;

        if (!this.viewport) return;

        const sensor = hass.states[this.config?.entity];
        if (!sensor) return;

        const rawEvents = sensor.attributes?.events ?? [];

        const minimal = rawEvents.map(e => ({
            id: e.zone?.id,
            program: e.program?.id ?? null,
            start: e.start,
            end: e.end,
            state: e.state,
            slot: e.slot,
            policy: e.policy
        }));

        const hash = JSON.stringify(minimal);

        if (hash === this._lastEventsHash) {
            this.updateNowLine();
            return;
        }

        this._lastEventsHash = hash;

        this._render();   // 👉 IMMER rendern wenn geändert
    }

    _render() {
        const hass = this._lastHass;
        if (!hass) return;

        const viewportWidth = this.viewport.getBoundingClientRect().width;

        if (!viewportWidth) {

            console.log("⏳ Layout not ready → retry");

            requestAnimationFrame(() => this._render());

            return;

        }
        console.log("Render Start");

        const entityId = this.config?.entity;
        const sensor = entityId ? hass.states[entityId] : null;

        if (!sensor) {
            console.warn("Entity not found:", entityId);
            return;
        }

        const rawEvents = sensor.attributes?.events ?? [];

        // 👉 KEIN HASH, KEIN minimal, KEIN early return

        const events = mapSensorEvents(rawEvents);

        console.log(events);

        const normalizedEvents = events.map(e => {
            if (!e.program) {
                return {
                    ...e,
                    program: "manual",
                    programName: "Manuell",
                    programColor: e.programColor || "#546E7A"
                };
            }
            return e;
        });


        console.log(normalizedEvents);

        // const cardWidth = this.cardEl.getBoundingClientRect().width;

        console.log({
            card: this.cardEl.getBoundingClientRect().width,
            viewport: this.viewport.clientWidth,
            timeline: this.timelineLayer.scrollWidth
        });
        /*
            if (this._lastTimelineHeight) {
              this.timeline.style.height = `${this._lastTimelineHeight}px`;
            }
        */
        // Lanes und vertikale Geometrie
        const programLanes = packProgramLanes(normalizedEvents);

        /*    const strictSlotCount = programLanes.reduce(
              (sum, p) => sum + p.slotCount,
              0
            );
        
            const strictHeight = strictSlotCount * EVENT_ROW_HEIGHT;
        */
        const strictLoadCount = programLanes.reduce(
            (sum, p) => sum + p.maxLoad,
            0
        );

        const strictHeight = strictLoadCount * EVENT_ROW_HEIGHT;

        const headerHeight =
            HEADER_ROW_HEIGHT +
            TIME_ROW_HEIGHT +
            HEADER_GAP;

        const timelineHeight =
            headerHeight + strictHeight;

        // ViewPort-Höhe setzen
        const MAX_VISIBLE_SLOTS = 8;

        const maxHeight =
            HEADER_ROW_HEIGHT +
            TIME_ROW_HEIGHT +
            HEADER_GAP +
            MAX_VISIBLE_SLOTS * EVENT_ROW_HEIGHT;

        const viewportHeight = Math.min(timelineHeight, maxHeight);

        this.viewport.style.height = `${viewportHeight}px`;
        this.viewport.style.overflowY =
            timelineHeight > maxHeight ? "auto" : "hidden";

        this.viewport.style.maxHeight = `${viewportHeight}px`;
        this.viewport.style.boxSizing = "border-box";

        console.log("0 viewport:", this.viewport.offsetHeight);
        console.log("0 timeline:", this.timelineLayer.offsetHeight);

        // Horizontale Geometrie
        // viewportWidth =
        //    this.viewport.getBoundingClientRect().width;

        this.labelLayer.style.width = `${viewportWidth}px`;

        const HOURS_VISIBLE = this.hoursVisible ?? 12;
        const minutesVisible = HOURS_VISIBLE * 60;

        const pxPerMinute = viewportWidth / minutesVisible;

        const minEventStart = events.reduce(
            (min, e) => e.start < min ? e.start : min,
            events[0]?.start ?? new Date()
        );

        const maxEventEnd = events.reduce(
            (max, e) => e.end > max ? e.end : max,
            events[0]?.end ?? new Date()
        );

        const timelineStart = startOfDay(minEventStart);
        const timelineEnd = endOfDay(maxEventEnd);

        const minutesTotal =
            (timelineEnd - timelineStart) / 60000;

        const timelineWidth =
            minutesTotal * pxPerMinute;

        // Layer dimensioneíeren - alle Daten ermittelt
        this._timelineStart = timelineStart;
        this._timelineEnd = timelineEnd;
        this._pxPerMinute = pxPerMinute;

        this.timelineLayer.style.width = `${timelineWidth}px`;
        this.timelineLayer.style.height = `${timelineHeight}px`;

        this.gridLayer.style.width = `${timelineWidth}px`;
        this.gridLayer.style.height = `${viewportHeight}px`;

        this.labelLayer.style.width = `${viewportWidth}px`;   // wichtig!
        this.labelLayer.style.height = `${timelineHeight}px`;

        // Layer leeren
        this.timelineLayer.innerHTML = "";
        this.labelLayer.innerHTML = "";
        this.gridLayer.innerHTML = "";

        let currentTop = headerHeight;

        const now = new Date();

        // 🔷 Header Hintergrund (verdeckt Timeline)
        const headerBg = document.createElement("div");
        headerBg.style.cssText = `
            position:absolute;
            left:0;
            top:0;
            width:100%;
            height:${HEADER_ROW_HEIGHT + TIME_ROW_HEIGHT}px;
            // background: var(--card-background-color, #fff);
            background: #fafafa;
            z-index:6;
            border-bottom:1px solid #ddd;
            `;
        this.gridLayer.appendChild(headerBg);


        console.log("minutesTotal :", minutesTotal);
        console.log("timelineStart:", timelineStart);
        console.log("timelineEnde:", timelineEnd);
        // Gridlines
        const totalHours = Math.ceil(minutesTotal / 60);

        for (let h = 0; h < totalHours; h++) {
            const m = h * 60;
            const x = Math.floor(m * pxPerMinute);

            const current = new Date(
                timelineStart.getTime() + m * 60000
            );

            // const current = new Date(timelineStart.getTime() + m * 60000);

            const isMidnight = current.getHours() === 0;
            const hourOfDay = current.getHours();

            // 🔹 Vertikale Linie (über komplette Timeline)
            if (m > 0) {
                const line = document.createElement("div");
                line.style.cssText = `
                    position:absolute;
                    left:${x}px;
                    top:0;
                    width:${isMidnight ? 2 : 1}px;
                    height:${timelineHeight}px;
                    background:${isMidnight ? "#444" : "#e0e0e0"};
                    z-index:7;
                    `;
                this.gridLayer.appendChild(line);
            }
            // 🔹 Datumslabel (nur Mitternacht)
            if (isMidnight) {
                const dateLabel = document.createElement("div");
                dateLabel.textContent = current.toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                });

                dateLabel.style.cssText = `
                    position:absolute;
                    left:${x + 6}px;
                    top:0;
                    height:${HEADER_ROW_HEIGHT}px;
                    line-height:${HEADER_ROW_HEIGHT}px;
                    font-size:12px;
                    font-weight:600;
                    white-space:nowrap;
                    color:#333;
                    z-index: 7;
                    `;
                this.gridLayer.appendChild(dateLabel);
            }

            // 🔹 Uhrzeit alle 2 Stunden (außer 00:00)
            if (!isMidnight && hourOfDay % 2 === 0) {
                const hourLabel = document.createElement("div");
                hourLabel.textContent =
                    String(hourOfDay).padStart(2, "0") + ":00";

                hourLabel.style.cssText = `
                    position:absolute;
                    left:${x + 4}px;
                    top:${HEADER_ROW_HEIGHT}px;
                    height:${TIME_ROW_HEIGHT}px;
                    line-height:${TIME_ROW_HEIGHT}px;
                    font-size:11px;
                    white-space:nowrap;
                    color:#666;
                    z-index: 7;
                    `;
                this.gridLayer.appendChild(hourLabel);
            }
        }

        for (const program of programLanes) {
            const programTop = currentTop;
            // const color = getProgramColor(program.programId);
            const color = program.programColor || "#9e9e9e";

            //      const programHeight =
            //        program.slotCount * EVENT_ROW_HEIGHT;

            const programHeight =
                program.maxLoad * EVENT_ROW_HEIGHT;

            // 🔷 Lane Hintergrund im labelLayer
            const bg = document.createElement("div");
            bg.style.cssText = `
                position:absolute;
                left:0;
                width:100%;
                top:${programTop}px;
                height:${programHeight}px;
                background:${color}22;
                border-left:4px solid ${color};
                box-sizing:border-box;
            `;
            this.labelLayer.appendChild(bg);

            // 🔷 Programmlabel
            const LABEL_WIDTH = 110;

            const label = document.createElement("div");
            label.textContent = program.programName;

            label.style.cssText = `
                position:absolute;
                left:0;
                top:${programTop}px;
                width:${LABEL_WIDTH}px;
                height:${programHeight}px;

                display:flex;
                align-items:center;
                padding:0 8px;

                font-weight:600;
                font-size:13px;

                background:${color}80;
                border-right:1px solid ${color}55;

                white-space:nowrap;
                overflow:hidden;
                text-overflow:ellipsis;

                box-sizing:border-box;
            `;

            this.labelLayer.appendChild(label);

            // Events
            for (const e of program.events) {
                const slotTop = programTop + (e.slot ?? 0) * EVENT_ROW_HEIGHT;

                const startPx =
                    (e.start - timelineStart) / 60000 * pxPerMinute;
                const endPx =
                    (e.end - timelineStart) / 60000 * pxPerMinute;

                const left = Math.round(startPx);
                const right = Math.round(endPx);
                const width = Math.max(right - left, 6);

                const bar = document.createElement("div");

                const height = (EVENT_ROW_HEIGHT * (e.load ?? 1)) - 4;

                bar.style.cssText = `
                    position:absolute;
                    left:${left}px;
                    top:${(slotTop + 2)}px;

                    height:${height}px;
                    width:${width}px;
                    background:${color};
                    
                    border-radius:4px;
                    color:white;
                    font-size:12px;
                    padding-left:6px;
                    line-height:${height}px;
                    white-space:nowrap;
                    overflow:hidden;
                    z-index:1;
                    box-sizing: border-box;
                    `;
                applyStateStyle(bar, e.state);
                bar.textContent = e.label;

                // Tooltip bleibt exakt wie bei dir
                bar.addEventListener("mouseenter", () => {
                    const startStr = formatTime(e.start);
                    const endStr = formatTime(e.end);
                    const durationStr = formatMinutes(e.durationMin);

                    let remainingStr = "";
                    if (e.state === "running") {
                        remainingStr = `<br><span style="color:#ffcc80">
                            Rest: ${formatMinutes(getRemainingMinutes(e.end))}
                            </span>`;
                    }

                    this.tooltip.innerHTML = `
                        <div style="font-weight:600">${e.label}</div>
                        <div style="margin-top:2px">
                        ${startStr} – ${endStr} · ${durationStr}
                        ${remainingStr}
                        </div>
                        <div style="margin-top:4px; opacity:0.85">
                        ${e.programName ?? "Manuell"} · ${translateState(e.state)}
                        </div>
                        <div style="margin-top:4px; opacity:0.85">
                        Slot ${e.slot}
                        </div>
                    `;

                    this.tooltip.style.display = "block";
                });

                bar.addEventListener("mousemove", (ev) => {
                    this.tooltip.style.left = `${ev.clientX + 12}px`;
                    this.tooltip.style.top = `${ev.clientY + 12}px`;
                });

                bar.addEventListener("mouseleave", () => {
                    this.tooltip.style.display = "none";
                });
                this.timelineLayer.appendChild(bar);
            }

            // currentTop += program.slotCount * EVENT_ROW_HEIGHT;
            currentTop += program.maxLoad * EVENT_ROW_HEIGHT;
        }

        // Now-Line einmal anlegen
        if (!this.nowLine) {
            this.nowLine = document.createElement("div");
            this.nowLine.className = "now-line";
            this.nowLine.style.cssText = `
                position:absolute;
                top:0;
                width:4px;
                background:#ff1744;
                z-index:4;
                will-change: transform;
            `;
        }

        if (!this.timelineLayer.contains(this.nowLine)) {
            this.timelineLayer.appendChild(this.nowLine);
        }

        this.updateNowLine();

        /*
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.autoScrollToNow();
          });
        });
        */
        if (!this._autoScrolled) {

            requestAnimationFrame(() => {

                this.autoScrollToNow();

            });

        }
        console.log(this.contextLayer.getBoundingClientRect())
        console.log(this.viewport.getBoundingClientRect())
        this.updateContextDayLabel();
    }

    getCardSize() {
        return 4;
    }
}

// ---------- Register custom element ----------
const tagName = "sprinklerv2-timeline-card";

class SprinklerTimelineCard extends SprinklerTimelineCardBase { }

customElements.define(
    "sprinklerv2-timeline-card",
    SprinklerTimelineCard
)