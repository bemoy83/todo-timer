// ===== State =====
let tasks = JSON.parse(localStorage.getItem("tasks") || "[]");
let active = null; // {tid,sid,startTime}
function save() { localStorage.setItem("tasks", JSON.stringify(tasks)); }

let UI_LOCK = false; // when true, skip full render() calls

// ===== Rendering =====
const listEl = document.getElementById("taskList");

function render() {
	if (UI_LOCK) return; // <-- prevents jumpiness during gestures
    listEl.innerHTML = "";
    tasks.forEach(task => {
	const card = document.createElement("div");
	card.className = "card";
	card.id = "task-" + task.id;

	const header = document.createElement("div");
	header.className = "task-header";
	header.textContent = task.title;
	card.appendChild(header);

	task.subtasks.forEach(st => {
	  const row = document.createElement("div");
	  row.className = "subtask";
	  row.id = `sub-${task.id}-${st.id}`;

	  row.innerHTML = `
		<div class="swipe-bg">Delete</div>
		<div class="swipe-fore">
		  <span>${st.title}</span>
		  <span>${fmt(st.time)}</span>
		</div>`;
	  card.appendChild(row);
	});

	listEl.appendChild(card);
  });
}

function fmt(ms) {
  const sec = Math.floor(ms / 1000);
  const m = String(Math.floor(sec/60)).padStart(2,"0");
  const s = String(sec%60).padStart(2,"0");
  return `${m}:${s}`;
}

// ===== Timer loop =====
function renderTimesOnly() {
  if (UI_LOCK) return;
  tasks.forEach(t => {
	t.subtasks.forEach(s => {
	  const row = document.getElementById(`sub-${t.id}-${s.id}`);
	  if (!row) return;
	  const timeSpan = row.querySelector(".swipe-fore > span:last-child");
	  if (timeSpan) timeSpan.textContent = fmt(s.time);
	});
  });
}

function tick() {
  if (active) {
	const st = getSubtask(active.tid, active.sid);
	st.time = active.base + (Date.now() - active.startTime);
	renderTimesOnly(); // <-- no full render during ticking
  }
  requestAnimationFrame(tick);
}

tick();

function getSubtask(tid, sid) {
  return tasks.find(t => t.id===tid).subtasks.find(s => s.id===sid);
}

// ===== Gestures: Swipe (smooth, non-janky) =====
(function enableSwipes(){
  const host = listEl;
  let fore = null, rowEl = null;
  let startX = 0, startY = 0, dx = 0, rafId = 0, locked = false;

  function applyTransform() {
	if (!fore) return;
	fore.style.transform = `translateX(${dx}px)`;
	rafId = 0;
  }

  host.addEventListener("touchstart", e => {
	const el = e.target.closest(".swipe-fore");
	if (!el) return;
	bodyClassAdd("swiping");
	fore = el;
	rowEl = fore.parentElement;
	startX = e.touches[0].clientX;
	startY = e.touches[0].clientY;
	dx = 0; locked = false;
	// keep height stable (some iOS fonts reflow on transform)
	rowEl.style.height = rowEl.getBoundingClientRect().height + "px";
  }, {passive:true});

  host.addEventListener("touchmove", e => {
	if (!fore) return;
	const x = e.touches[0].clientX;
	const y = e.touches[0].clientY;
	const adx = Math.abs(x - startX), ady = Math.abs(y - startY);
	if (!locked) {
	  if (adx > 8 && ady < 10) { locked = true; }
	  else return; // treat as vertical scroll
	}
	e.preventDefault(); // we own this gesture now
	dx = Math.max(-110, Math.min(110, x - startX));
	if (!rafId) rafId = requestAnimationFrame(applyTransform);
  }, {passive:false});

  function finishSwipe(commit) {
	if (!fore) return;
	// snap animation
	fore.style.transition = "transform .16s ease-out";
	fore.style.transform = "translateX(0)";
	setTimeout(() => {
	  if (!fore) return;
	  fore.style.transition = "";
	  rowEl.style.height = ""; // release fixed height
	  fore = null; rowEl = null;
	  bodyClassRemove("swiping");
	}, 170);

	if (!commit) return;
	const [_, tid, sid] = rowEl.id.split("-").map(v=>isNaN(+v)?v:+v);
	if (dx <= -80) {
	  openDeleteModal(tid, sid);
	} else if (dx >= 80) {
	  toggleTimer(tid, sid);
	}
  }

  host.addEventListener("touchend", () => {
	if (!fore) return;
	const shouldCommit = Math.abs(dx) >= 80;
	finishSwipe(shouldCommit);
  });

  host.addEventListener("touchcancel", () => finishSwipe(false));

  function bodyClassAdd(c){ document.body.classList.add(c); }
  function bodyClassRemove(c){ document.body.classList.remove(c); }
})();

// ===== Drag reorder (cards) — non-janky =====
(function enableReorder(){
  let dragging = null;     // original card element
  let proxy = null;        // absolute position clone
  let placeholder = null;  // size holder in the flow
  let startY = 0, offsetY = 0, listTop = 0;

  listEl.addEventListener("pointerdown", e => {
	const card = e.target.closest(".card");
	if (!card) return;

	// Don’t start a drag when starting on a control (like a button inside)
	if (e.target.closest("button, input, textarea")) return;

	UI_LOCK = true; // freeze render while dragging
	document.body.classList.add("dragging");

	dragging = card;
	startY = e.clientY;

	// make placeholder with same dimensions
	const rect = card.getBoundingClientRect();
	placeholder = document.createElement("div");
	placeholder.className = "placeholder";
	placeholder.style.height = rect.height + "px";
	placeholder.style.margin = getComputedStyle(card).margin;
	card.parentNode.insertBefore(placeholder, card.nextSibling);

	// create proxy clone
	proxy = card.cloneNode(true);
	proxy.classList.add("drag-proxy");
	proxy.style.width = rect.width + "px";
	proxy.style.top = rect.top + window.scrollY + "px";
	listTop = listEl.getBoundingClientRect().top + window.scrollY;

	// lift proxy to body so it doesn't influence list layout
	document.body.appendChild(proxy);
	card.style.display = "none";

	// capture pointer
	card.setPointerCapture?.(e.pointerId);
	card.addEventListener("pointermove", onMove);
	card.addEventListener("pointerup", onUp, {once:true});
	e.preventDefault();
  });

  function onMove(e){
	offsetY = e.clientY - startY;
	proxy.style.transform = `translateY(${offsetY}px)`;

	// find desired index by comparing proxy center vs card centers
	const centerY = proxy.getBoundingClientRect().top + proxy.offsetHeight / 2 + window.scrollY;
	const cards = Array.from(listEl.querySelectorAll(".card")).filter(c => c !== dragging);
	let target = null;
	for (const c of cards) {
	  const r = c.getBoundingClientRect();
	  const mid = r.top + window.scrollY + r.height / 2;
	  if (centerY < mid) { target = c; break; }
	}
	// move placeholder before target (or to end)
	if (target) listEl.insertBefore(placeholder, target);
	else listEl.appendChild(placeholder);
  }

  function onUp(){
	// drop: place original card where placeholder is
	listEl.insertBefore(dragging, placeholder);
	dragging.style.display = "";
	proxy.remove(); proxy = null;
	placeholder.remove(); placeholder = null;

	// compute new order & persist
	const ids = [...listEl.querySelectorAll(".card")].map(c => parseInt(c.id.split("-")[1], 10));
	tasks.sort((a,b)=> ids.indexOf(a.id) - ids.indexOf(b.id));
	save();

	dragging.removeEventListener("pointermove", onMove);
	dragging = null;
	document.body.classList.remove("dragging");
	UI_LOCK = false; // allow render again
	render(); // single re-render after drop
  }
})();

// ===== Timer controls =====
function toggleTimer(tid, sid){
  if(active && active.tid===tid && active.sid===sid){
	// stop
	active=null;
  } else {
	const st = getSubtask(tid,sid);
	active={tid,sid,startTime:Date.now(),base:st.time};
  }
}

// ===== Delete modal =====
const deleteModal = document.getElementById("deleteModal");
const deleteMsg = document.getElementById("deleteMessage");
let deleteTarget = null;

function openDeleteModal(tid,sid){
  deleteTarget={tid,sid};
  deleteMsg.textContent="Delete this subtask?";
  deleteModal.classList.remove("hidden");
}
document.getElementById("cancelDeleteBtn").onclick=()=>deleteModal.classList.add("hidden");
document.getElementById("confirmDeleteBtn").onclick=()=>{
  const t = tasks.find(x=>x.id===deleteTarget.tid);
  t.subtasks = t.subtasks.filter(s=>s.id!==deleteTarget.sid);
  save(); render();
  deleteModal.classList.add("hidden");
};

// ===== Menu modal =====
const menuModal=document.getElementById("menuModal");
document.getElementById("menuBtn").onclick=()=>menuModal.classList.toggle("hidden");

// ===== Dark mode =====
document.getElementById("darkToggleBtn").onclick=()=>{
  document.body.classList.toggle("dark");
  localStorage.setItem("dark", document.body.classList.contains("dark"));
};
if(localStorage.getItem("dark")==="true") document.body.classList.add("dark");

// ===== Init sample tasks if none =====
if(!tasks.length){
  tasks=[{id:1,title:"Demo Task",subtasks:[
	{id:1,title:"Try swipe right",time:0},
	{id:2,title:"Try swipe left",time:0}
  ]}];
  save();
}
render();
