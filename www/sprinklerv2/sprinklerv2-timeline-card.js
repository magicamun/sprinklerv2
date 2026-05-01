console.log(`TIMELINE FILE LOADED 1.2`);var e=22,t=18,n=40,r=4;function i(e){switch(e){case`running`:return`Aktiv`;case`queued`:return`Wartet`;case`done`:return`Fertig`;case`cancelled`:return`Abgebrochen`;default:return e??`Unbekannt`}}function a(e){return e.toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`})}function o(e){return e<1?`<1 min`:`${Math.round(e)} min`}function s(e){return Math.max(0,(e-new Date)/6e4)}function c(e){let t=new Date(e);return t.setHours(0,0,0,0),t}function l(e){let t=new Date(e);return t.setHours(24,0,0,0),t}function u(e,t){switch(t){case`running`:e.style.opacity=`1`,e.style.boxShadow=`0 0 0 2px rgba(0,0,0,0.25)`,e.style.outline=`2px solid rgba(255,255,255,0.6)`;break;case`queued`:e.style.opacity=`0.85`,e.style.filter=`saturate(0.85)`;break;case`done`:e.style.opacity=`0.45`,e.style.filter=`saturate(0.7)`;break;case`cancelled`:e.style.opacity=`0.7`,e.style.backgroundImage=`repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0 6px, transparent 6px 12px)`;break;case`skipped`:e.style.border=`2px dashed rgba(0,0,0,0.4)`,e.style.opacity=`0.8`;break;case`skip`:e.style.border=`2px dashed rgba(0,0,0,0.4)`,e.style.opacity=`0.8`;break}}function d(e){return Array.isArray(e)?e.map(e=>{let t=new Date(e.start),n=new Date(e.end);return{label:e.zone?.name??`Unbekannte Zone`,start:t,end:n,durationMin:(n-t)/6e4,program:e.program?.id??null,programName:e.program?.name??null,programColor:e.program?.color??e.program_color??`#9e9e9e`,policy:e.policy,state:e.state,slot:e.slot,load:e.load??1}}):[]}function f(e){let t=new Map;for(let n of e){let e=n.program;t.has(e)||t.set(e,{programId:e,programName:n.programName??`Unbenannt`,programColor:n.programColor??n.program_color??`9e9e9e`,events:[],maxLoad:1}),t.get(e).events.push(n)}for(let e of t.values())new Set(e.events.map(e=>e.slot??0)),e.maxLoad=Math.max(...e.events.map(e=>(e.slot??0)+(e.load??1)));return Array.from(t.values()).sort((e,t)=>e.programId===`manual`?1:t.programId===`manual`?-1:e.programName.localeCompare(t.programName))}var p=class extends HTMLElement{autoScrollToNow(){if(!this._timelineStart||!this._timelineEnd||this._autoScrolled)return;let e=new Date;if(e<this._timelineStart||e>this._timelineEnd)return;let t=this._timelineEnd-this._timelineStart,n=(e-this._timelineStart)/t,r=this.timelineLayer.scrollWidth,i=this.viewport.clientWidth,a=n*r-i*.3,o=r-i;this.viewport.scrollLeft=Math.min(Math.max(0,a),o),this._autoScrolled=!0}setConfig(e){e.entity||console.warn(`No entity defined, falling back to sensor.sprinkler_timeline`),this.config={entity:e.entity??`sensor.sprinkler_timeline`,...e}}_handleNavigation(e){if(!this._pxPerMinute)return;let t=this.timelineLayer.scrollWidth-this.viewport.clientWidth,n=1440*this._pxPerMinute;switch(e){case`start`:this.viewport.scrollTo({left:0,behavior:`smooth`});break;case`end`:this.viewport.scrollTo({left:t,behavior:`smooth`});break;case`now`:this._autoScrolled=!1,this.autoScrollToNow();break;case`+1d`:this.viewport.scrollTo({left:Math.min(this.viewport.scrollLeft+n,t),behavior:`smooth`});break;case`-1d`:this.viewport.scrollTo({left:Math.max(this.viewport.scrollLeft-n,0),behavior:`smooth`});break}}updateContextDayLabel(){let e=(this.viewport.scrollLeft+110)/this._pxPerMinute,t=c(new Date(this._timelineStart.getTime()+e*6e4));this.contextDayLabel.textContent=t.toLocaleDateString(void 0,{weekday:`short`,day:`2-digit`,month:`2-digit`})}updateNowLine(){if(!this.nowLine||!this._timelineStart||!this._pxPerMinute)return;let e=new Date;if(e<this._timelineStart||e>this._timelineEnd){this.nowLine.style.display=`none`;return}let t=(e-this._timelineStart)/6e4*this._pxPerMinute;this.nowLine.style.display=`block`,this.nowLine.style.transform=`translateX(${t}px)`,this.nowLine.style.height=`${this.timelineLayer.offsetHeight}px`}connectedCallback(){if(console.log(`Timeline connected`),this._connected)return;this._connected=!0,this._autoScrolled=!1,this._layoutReady=!1,this._lastHass=null;let n=this.config?.title??`Sprinkler Timeline`;console.log(n),this.innerHTML=`
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
                <div>${n}</div>
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
            `,this.timelineLayer=this.querySelector(`#timelineLayer`),this.gridLayer=this.querySelector(`#gridLayer`),this.labelLayer=this.querySelector(`#labelLayer`),this.viewport=this.querySelector(`#viewport`),this._resizeObserver=new ResizeObserver(e=>{for(let t of e){let e=t.contentRect.width;if(!e||e===this._lastWidth)return;this._lastWidth=e,console.log(`📐 Resize detected:`,e),this._lastEventsHash=null,requestAnimationFrame(()=>{this._render()})}}),this._resizeObserver.observe(this.viewport),this.cardEl=this.querySelector(`ha-card`),this.zoomSelect=this.querySelector(`#zoom`),this.labelLayer.innerHTML=``,this._minuteTimer=setInterval(()=>{this._timelineStart&&this._timelineEnd&&this._pxPerMinute&&this.updateNowLine()},6e4),this.viewport.addEventListener(`scroll`,()=>{let e=this.viewport.scrollLeft,t=this.viewport.scrollTop;this.labelLayer.style.transform=`translateX(${e}px)`,this.gridLayer.style.transform=`translateY(${t}px)`,this.updateContextDayLabel()}),this.querySelector(`ha-card`),this.zoomSelect.addEventListener(`change`,e=>{this.hoursVisible=Number(e.target.value),this._autoScrolled=!1,this._lastEventsHash=null,this._lastHass&&(this.hass=this._lastHass)}),this.zoomSelect=this.querySelector(`#zoom`),this.querySelector(`.nav-buttons`).addEventListener(`click`,e=>{let t=e.target.closest(`button`);if(!t)return;let n=t.dataset.nav;this._handleNavigation(n)}),this.tooltip=document.createElement(`div`),this.tooltip.style.cssText=`
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
            `,document.body.appendChild(this.tooltip),this.contextLayer=this.querySelector(`#contextLayer`),this.contextDayLabel=document.createElement(`div`);let r=e+t;console.log(r),this.contextDayLabel.style.cssText=`
            position:absolute;
            left:0;
            top:0;
            width: 110px; /* LABEL_WIDTH */
            height:${r}px;
            line-height:${e}px;
            background:#fafafa;
            font-weight:600;
            font-size:12px;
            padding-left:8px;
            box-sizing:border-box;
            `,this.contextLayer.style.width=`${this.viewport.clientWidth}px`,this.contextLayer.style.height=`${r}px`,this.contextLayer.appendChild(this.contextDayLabel)}disconnectedCallback(){console.log(`Timeline disconnected`),this._resizeObserver&&this._resizeObserver.disconnect()}set hass(e){if(this._lastHass=e,!this._connected||!this.viewport||!this.viewport)return;let t=e.states[this.config?.entity];if(!t)return;let n=(t.attributes?.events??[]).map(e=>({id:e.zone?.id,program:e.program?.id??null,start:e.start,end:e.end,state:e.state,slot:e.slot,policy:e.policy})),r=JSON.stringify(n);if(r===this._lastEventsHash){this.updateNowLine();return}this._lastEventsHash=r,this._render()}_render(){let p=this._lastHass;if(!p)return;let m=this.viewport.getBoundingClientRect().width;if(!m){console.log(`⏳ Layout not ready → retry`),requestAnimationFrame(()=>this._render());return}console.log(`Render Start`);let h=this.config?.entity,g=h?p.states[h]:null;if(!g){console.warn(`Entity not found:`,h);return}let _=d(g.attributes?.events??[]);console.log(_);let v=_.map(e=>e.program?e:{...e,program:`manual`,programName:`Manuell`,programColor:e.programColor||`#546E7A`});console.log(v),console.log({card:this.cardEl.getBoundingClientRect().width,viewport:this.viewport.clientWidth,timeline:this.timelineLayer.scrollWidth});let y=f(v),b=y.reduce((e,t)=>e+t.maxLoad,0)*n,x=e+t+r,S=x+b,C=e+t+r+8*n,w=Math.min(S,C);this.viewport.style.height=`${w}px`,this.viewport.style.overflowY=S>C?`auto`:`hidden`,this.viewport.style.maxHeight=`${w}px`,this.viewport.style.boxSizing=`border-box`,console.log(`0 viewport:`,this.viewport.offsetHeight),console.log(`0 timeline:`,this.timelineLayer.offsetHeight),this.labelLayer.style.width=`${m}px`;let T=m/((this.hoursVisible??12)*60),E=_.reduce((e,t)=>t.start<e?t.start:e,_[0]?.start??new Date),D=_.reduce((e,t)=>t.end>e?t.end:e,_[0]?.end??new Date),O=c(E),k=l(D),A=(k-O)/6e4,j=A*T;this._timelineStart=O,this._timelineEnd=k,this._pxPerMinute=T,this.timelineLayer.style.width=`${j}px`,this.timelineLayer.style.height=`${S}px`,this.gridLayer.style.width=`${j}px`,this.gridLayer.style.height=`${w}px`,this.labelLayer.style.width=`${m}px`,this.labelLayer.style.height=`${S}px`,this.timelineLayer.innerHTML=``,this.labelLayer.innerHTML=``,this.gridLayer.innerHTML=``;let M=x,N=document.createElement(`div`);N.style.cssText=`
            position:absolute;
            left:0;
            top:0;
            width:100%;
            height:${e+t}px;
            // background: var(--card-background-color, #fff);
            background: #fafafa;
            z-index:6;
            border-bottom:1px solid #ddd;
            `,this.gridLayer.appendChild(N),console.log(`minutesTotal :`,A),console.log(`timelineStart:`,O),console.log(`timelineEnde:`,k);let P=Math.ceil(A/60);for(let n=0;n<P;n++){let r=n*60,i=Math.floor(r*T),a=new Date(O.getTime()+r*6e4),o=a.getHours()===0,s=a.getHours();if(r>0){let e=document.createElement(`div`);e.style.cssText=`
                    position:absolute;
                    left:${i}px;
                    top:0;
                    width:${o?2:1}px;
                    height:${S}px;
                    background:${o?`#444`:`#e0e0e0`};
                    z-index:7;
                    `,this.gridLayer.appendChild(e)}if(o){let t=document.createElement(`div`);t.textContent=a.toLocaleDateString(void 0,{weekday:`short`,day:`2-digit`,month:`2-digit`}),t.style.cssText=`
                    position:absolute;
                    left:${i+6}px;
                    top:0;
                    height:${e}px;
                    line-height:${e}px;
                    font-size:12px;
                    font-weight:600;
                    white-space:nowrap;
                    color:#333;
                    z-index: 7;
                    `,this.gridLayer.appendChild(t)}if(!o&&s%2==0){let n=document.createElement(`div`);n.textContent=String(s).padStart(2,`0`)+`:00`,n.style.cssText=`
                    position:absolute;
                    left:${i+4}px;
                    top:${e}px;
                    height:${t}px;
                    line-height:${t}px;
                    font-size:11px;
                    white-space:nowrap;
                    color:#666;
                    z-index: 7;
                    `,this.gridLayer.appendChild(n)}}for(let e of y){let t=M,r=e.programColor||`#9e9e9e`,c=e.maxLoad*n,l=document.createElement(`div`);l.style.cssText=`
                position:absolute;
                left:0;
                width:100%;
                top:${t}px;
                height:${c}px;
                background:${r}22;
                border-left:4px solid ${r};
                box-sizing:border-box;
            `,this.labelLayer.appendChild(l);let d=document.createElement(`div`);d.textContent=e.programName,d.style.cssText=`
                position:absolute;
                left:0;
                top:${t}px;
                width:110px;
                height:${c}px;

                display:flex;
                align-items:center;
                padding:0 8px;

                font-weight:600;
                font-size:13px;

                background:${r}80;
                border-right:1px solid ${r}55;

                white-space:nowrap;
                overflow:hidden;
                text-overflow:ellipsis;

                box-sizing:border-box;
            `,this.labelLayer.appendChild(d);for(let c of e.events){let e=t+(c.slot??0)*n,l=(c.start-O)/6e4*T,d=(c.end-O)/6e4*T,f=Math.round(l),p=Math.max(Math.round(d)-f,6),m=document.createElement(`div`),h=n*(c.load??1)-4;m.style.cssText=`
                    position:absolute;
                    left:${f}px;
                    top:${e+2}px;

                    height:${h}px;
                    width:${p}px;
                    background:${r};
                    
                    border-radius:4px;
                    color:white;
                    font-size:12px;
                    padding-left:6px;
                    line-height:${h}px;
                    white-space:nowrap;
                    overflow:hidden;
                    z-index:1;
                    box-sizing: border-box;
                    `,u(m,c.state),m.textContent=c.label,m.addEventListener(`mouseenter`,()=>{let e=a(c.start),t=a(c.end),n=o(c.durationMin),r=``;c.state===`running`&&(r=`<br><span style="color:#ffcc80">
                            Rest: ${o(s(c.end))}
                            </span>`),this.tooltip.innerHTML=`
                        <div style="font-weight:600">${c.label}</div>
                        <div style="margin-top:2px">
                        ${e} – ${t} · ${n}
                        ${r}
                        </div>
                        <div style="margin-top:4px; opacity:0.85">
                        ${c.programName??`Manuell`} · ${i(c.state)}
                        </div>
                        <div style="margin-top:4px; opacity:0.85">
                        Slot ${c.slot}
                        </div>
                    `,this.tooltip.style.display=`block`}),m.addEventListener(`mousemove`,e=>{this.tooltip.style.left=`${e.clientX+12}px`,this.tooltip.style.top=`${e.clientY+12}px`}),m.addEventListener(`mouseleave`,()=>{this.tooltip.style.display=`none`}),this.timelineLayer.appendChild(m)}M+=e.maxLoad*n}this.nowLine||(this.nowLine=document.createElement(`div`),this.nowLine.className=`now-line`,this.nowLine.style.cssText=`
                position:absolute;
                top:0;
                width:4px;
                background:#ff1744;
                z-index:4;
                will-change: transform;
            `),this.timelineLayer.contains(this.nowLine)||this.timelineLayer.appendChild(this.nowLine),this.updateNowLine(),this._autoScrolled||requestAnimationFrame(()=>{this.autoScrollToNow()}),console.log(this.contextLayer.getBoundingClientRect()),console.log(this.viewport.getBoundingClientRect()),this.updateContextDayLabel()}getCardSize(){return 4}},m=class extends p{};customElements.define(`sprinklerv2-timeline-card`,m);