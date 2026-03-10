function J(e){switch(e){case"running":return"Aktiv";case"queued":return"Wartet";case"done":return"Fertig";case"cancelled":return"Abgebrochen";default:return e??"Unbekannt"}}function C(e){return e.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}function D(e){return e<1?"<1 min":`${Math.round(e)} min`}function Z(e){return Math.max(0,(e-new Date)/6e4)}function W(e){const t=new Date(e);return t.setHours(0,0,0,0),t}function K(e){const t=new Date(e);return t.setHours(24,0,0,0),t}function Q(e,t){switch(t){case"running":e.style.opacity="1",e.style.boxShadow="0 0 0 2px rgba(0,0,0,0.25)",e.style.outline="2px solid rgba(255,255,255,0.6)";break;case"queued":e.style.opacity="0.85",e.style.filter="saturate(0.85)";break;case"done":e.style.opacity="0.45",e.style.filter="saturate(0.7)";break;case"cancelled":e.style.opacity="0.7",e.style.backgroundImage="repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0 6px, transparent 6px 12px)";break;case"skipped":e.style.border="2px dashed rgba(0,0,0,0.4)",e.style.opacity="0.8";break;case"skip":e.style.border="2px dashed rgba(0,0,0,0.4)",e.style.opacity="0.8";break}}function tt(e){return Array.isArray(e)?e.map(t=>{const o=new Date(t.start),n=new Date(t.end);return{label:t.zone?.name??"Unbekannte Zone",start:o,end:n,durationMin:(n-o)/6e4,program:t.program?.id??null,programName:t.program?.name??null,programColor:t.program?.color??t.program_color??"#9e9e9e",policy:t.policy,state:t.state,slot:t.slot}}):[]}function et(e){const t=new Map;for(const o of e){const n=o.program;t.has(n)||t.set(n,{programId:n,programName:o.programName??"Unbenannt",programColor:o.programColor??o.program_color??"9e9e9e",events:[],slotCount:0}),t.get(n).events.push(o)}for(const o of t.values()){const n=new Set(o.events.map(s=>s.slot??0));o.slotCount=n.size}return Array.from(t.values()).sort((o,n)=>o.programId==="manual"?1:n.programId==="manual"?-1:o.programName.localeCompare(n.programName))}class it extends HTMLElement{autoScrollToNow(){if(!this._timelineStart||!this._timelineEnd||this._autoScrolled)return;const t=new Date;if(t<this._timelineStart||t>this._timelineEnd)return;const o=this._timelineEnd-this._timelineStart,n=(t-this._timelineStart)/o,s=this.timelineLayer.scrollWidth,d=this.viewport.clientWidth,m=n*s-d*.3,h=s-d;this.viewport.scrollLeft=Math.min(Math.max(0,m),h),this._autoScrolled=!0}setConfig(t){t.entity||console.warn("No entity defined, falling back to sensor.sprinkler_timeline"),this.config={entity:t.entity??"sensor.sprinkler_timeline",...t}}_handleNavigation(t){if(!this._pxPerMinute)return;const o=this.timelineLayer.scrollWidth-this.viewport.clientWidth,n=1440*this._pxPerMinute;switch(t){case"start":this.viewport.scrollTo({left:0,behavior:"smooth"});break;case"end":this.viewport.scrollTo({left:o,behavior:"smooth"});break;case"now":this._autoScrolled=!1,this.autoScrollToNow();break;case"+1d":this.viewport.scrollTo({left:Math.min(this.viewport.scrollLeft+n,o),behavior:"smooth"});break;case"-1d":this.viewport.scrollTo({left:Math.max(this.viewport.scrollLeft-n,0),behavior:"smooth"});break}}updateContextDayLabel(){const n=(this.viewport.scrollLeft+110)/this._pxPerMinute,s=new Date(this._timelineStart.getTime()+n*6e4),d=W(s);this.contextDayLabel.textContent=d.toLocaleDateString(void 0,{weekday:"short",day:"2-digit",month:"2-digit"})}updateNowLine(){if(!this.nowLine||!this._timelineStart||!this._pxPerMinute)return;const t=new Date;if(t<this._timelineStart||t>this._timelineEnd){this.nowLine.style.display="none";return}const n=(t-this._timelineStart)/6e4*this._pxPerMinute;this.nowLine.style.display="block",this.nowLine.style.left=`${n}px`,this.nowLine.style.height=`${this.timelineLayer.offsetHeight}px`}connectedCallback(){if(this._connected)return;this._connected=!0,this._autoScrolled=!1,this._layoutReady=!1,this._lastHass=null;const o=this.config?.title??sensor.attributes?.friendly_name??"Sprinkler Timeline";console.log(o),this.innerHTML=`
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
          <div>${o}</div>
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
    `,this.timelineLayer=this.querySelector("#timelineLayer"),this.gridLayer=this.querySelector("#gridLayer"),this.labelLayer=this.querySelector("#labelLayer"),this.viewport=this.querySelector("#viewport"),this.cardEl=this.querySelector("ha-card"),this.zoomSelect=this.querySelector("#zoom"),this.labelLayer.innerHTML="",this._minuteTimer=setInterval(()=>{this._timelineStart&&this._timelineEnd&&this._pxPerMinute&&this.updateNowLine()},6e4),this.viewport.addEventListener("scroll",()=>{const s=this.viewport.scrollLeft,d=this.viewport.scrollTop;this.labelLayer.style.transform=`translateX(${s}px)`,this.gridLayer.style.transform=`translateY(${d}px)`,this.updateContextDayLabel()}),this.querySelector("ha-card"),this.zoomSelect.addEventListener("change",s=>{this.hoursVisible=Number(s.target.value),this._autoScrolled=!1,this._lastEventsHash=null,this._lastHass&&(this.hass=this._lastHass)}),this.zoomSelect=this.querySelector("#zoom"),this.querySelector(".nav-buttons").addEventListener("click",s=>{const d=s.target.closest("button");if(!d)return;const m=d.dataset.nav;this._handleNavigation(m)}),this.tooltip=document.createElement("div"),this.tooltip.style.cssText=`
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
    `,document.body.appendChild(this.tooltip),this.contextLayer=this.querySelector("#contextLayer"),this.contextDayLabel=document.createElement("div");const n=40;console.log(n),this.contextDayLabel.style.cssText=`
      position:absolute;
      left:0;
      top:0;
      width: 110px; /* LABEL_WIDTH */
      height:${n}px;
      line-height:22px;
      background:#fafafa;
      font-weight:600;
      font-size:12px;
      padding-left:8px;
      box-sizing:border-box;
    `,this.contextLayer.style.width=`${this.viewport.clientWidth}px`,this.contextLayer.style.height=`${n}px`,this.contextLayer.appendChild(this.contextDayLabel)}set hass(t){console.log("SET HASS TRIGGERED"),this._lastHass=t,this._connected&&this.viewport&&(console.log("line 0"),this._render())}_render(){const t=this._lastHass;if(!t)return;if(console.log("Render Start"),!this._layoutReady){this._layoutReady=!0;return}const o=this.config?.entity,n=o?t.states[o]:null;if(!n){console.warn("Entity not found:",o);return}const s=n?.attributes?.events??[],d=s.map(i=>({id:i.zone?.id,program:i.program?.id??null,start:i.start,end:i.end,state:i.state,slot:i.slot,policy:i.policy})),m=JSON.stringify(d);if(m===this._lastEventsHash){this.updateNowLine();return}this._lastEventsHash=m;const h=tt(s),O=h.map(i=>i.program?i:{...i,program:"manual",programName:"Manuell",programColor:i.programColor||"#546E7A"});console.log("line 3"),console.log({card:this.cardEl.getBoundingClientRect().width,viewport:this.viewport.clientWidth,timeline:this.timelineLayer.scrollWidth});const H=et(O),G=H.reduce((i,r)=>i+r.slotCount,0)*40,T=44,x=T+G,S=44+8*40,w=Math.min(x,S);this.viewport.style.height=`${w}px`,this.viewport.style.overflowY=x>S?"auto":"hidden",this.viewport.style.maxHeight=`${w}px`,this.viewport.style.boxSizing="border-box",console.log("0 viewport:",this.viewport.offsetHeight),console.log("0 timeline:",this.timelineLayer.offsetHeight);const E=this.viewport.getBoundingClientRect().width;this.labelLayer.style.width=`${E}px`;const N=(this.hoursVisible??12)*60,f=E/N,A=h.reduce((i,r)=>r.start<i?r.start:i,h[0]?.start??new Date),P=h.reduce((i,r)=>r.end>i?r.end:i,h[0]?.end??new Date),g=W(A),_=K(P),L=(_-g)/6e4,$=L*f;this._timelineStart=g,this._timelineEnd=_,this._pxPerMinute=f,this.timelineLayer.style.width=`${$}px`,this.timelineLayer.style.height=`${x}px`,this.gridLayer.style.width=`${$}px`,this.gridLayer.style.height=`${w}px`,this.labelLayer.style.width=`${E}px`,this.labelLayer.style.height=`${x}px`,this.timelineLayer.innerHTML="",this.labelLayer.innerHTML="",this.gridLayer.innerHTML="";let R=T;const I=document.createElement("div");I.style.cssText=`
      position:absolute;
      left:0;
      top:0;
      width:100%;
      height:40px;
      // background: var(--card-background-color, #fff);
      background: #fafafa;
      z-index:6;
      border-bottom:1px solid #ddd;
    `,this.gridLayer.appendChild(I),console.log("minutesTotal :",L),console.log("timelineStart:",g),console.log("timelineEnde:",_);const V=Math.ceil(L/60);for(let i=0;i<V;i++){const r=i*60,c=Math.floor(r*f),y=new Date(g.getTime()+r*6e4),p=y.getHours()===0,v=y.getHours();if(r>0){const a=document.createElement("div");a.style.cssText=`
          position:absolute;
          left:${c}px;
          top:0;
          width:${p?2:1}px;
          height:${x}px;
          background:${p?"#444":"#e0e0e0"};
          z-index:7;
        `,this.gridLayer.appendChild(a)}if(p){const a=document.createElement("div");a.textContent=y.toLocaleDateString(void 0,{weekday:"short",day:"2-digit",month:"2-digit"}),a.style.cssText=`
          position:absolute;
          left:${c+6}px;
          top:0;
          height:22px;
          line-height:22px;
          font-size:12px;
          font-weight:600;
          white-space:nowrap;
          color:#333;
          z-index: 7;
        `,this.gridLayer.appendChild(a)}if(!p&&v%2===0){const a=document.createElement("div");a.textContent=String(v).padStart(2,"0")+":00",a.style.cssText=`
          position:absolute;
          left:${c+4}px;
          top:22px;
          height:18px;
          line-height:18px;
          font-size:11px;
          white-space:nowrap;
          color:#666;
          z-index: 7;
        `,this.gridLayer.appendChild(a)}}for(const i of H){const r=R,c=i.programColor||"#9e9e9e",y=i.slotCount*40,p=document.createElement("div");p.style.cssText=`
        position:absolute;
        left:0;
        width:100%;
        top:${r}px;
        height:${y}px;
        background:${c}22;
        border-left:4px solid ${c};
        box-sizing:border-box;
      `,this.labelLayer.appendChild(p);const v=110,a=document.createElement("div");a.textContent=i.programName,a.style.cssText=`
        position:absolute;
        left:0;
        top:${r}px;
        width:${v}px;
        height:${y}px;

        display:flex;
        align-items:center;
        padding:0 8px;

        font-weight:600;
        font-size:13px;

        background:${c}80;
        border-right:1px solid ${c}55;

        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;

        box-sizing:border-box;
      `,this.labelLayer.appendChild(a);for(const l of i.events){const q=r+(l.slot??0)*40,B=(l.start-g)/6e4*f,X=(l.end-g)/6e4*f,M=Math.round(B),U=Math.round(X),F=Math.max(U-M,6),u=document.createElement("div");u.style.cssText=`
          position:absolute;
          left:${M}px;
          top:${q}px;

          height:36px;
          width:${F}px;
          background:${c};
          
          border-radius:4px;
          color:white;
          font-size:12px;
          padding-left:6px;
          line-height:36px;
          white-space:nowrap;
          overflow:hidden;
          z-index:1;
          box-sizing: border-box;
        `,Q(u,l.state),u.textContent=l.label,u.addEventListener("mouseenter",()=>{const b=C(l.start),Y=C(l.end),j=D(l.durationMin);let k="";l.state==="running"&&(k=`<br><span style="color:#ffcc80">
              Rest: ${D(Z(l.end))}
            </span>`),this.tooltip.innerHTML=`
            <div style="font-weight:600">${l.label}</div>
            <div style="margin-top:2px">
              ${b} – ${Y} · ${j}
              ${k}
            </div>
            <div style="margin-top:4px; opacity:0.85">
              ${l.programName??"Manuell"} · ${J(l.state)}
            </div>
            <div style="margin-top:4px; opacity:0.85">
              Slot ${l.slot}
            </div>
          `,this.tooltip.style.display="block"}),u.addEventListener("mousemove",b=>{this.tooltip.style.left=`${b.clientX+12}px`,this.tooltip.style.top=`${b.clientY+12}px`}),u.addEventListener("mouseleave",()=>{this.tooltip.style.display="none"}),this.timelineLayer.appendChild(u)}R+=i.slotCount*40}this.nowLine||(this.nowLine=document.createElement("div"),this.nowLine.className="now-line",this.nowLine.style.cssText=`
        position:absolute;
        top:0;
        width:4px;
        background:#ff1744;
        z-index:4;
      `),this.timelineLayer.contains(this.nowLine)||this.timelineLayer.appendChild(this.nowLine),this.updateNowLine(),requestAnimationFrame(()=>{requestAnimationFrame(()=>{this.autoScrollToNow()})}),console.log(this.contextLayer.getBoundingClientRect()),console.log(this.viewport.getBoundingClientRect()),this.updateContextDayLabel()}getCardSize(){return 4}}const z="sprinklerv2-timeline-card";class ot extends it{}customElements.get(z)||customElements.define(z,ot);
