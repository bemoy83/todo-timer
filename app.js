// ===== State =====
let tasks = JSON.parse(localStorage.getItem("tasks") || "[]");
let active = null; // {tid,sid,startTime}
function save() { localStorage.setItem("tasks", JSON.stringify(tasks)); }

// ===== Rendering =====
const listEl = document.getElementById("taskList");

function render() {
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
function tick() {
  if (active) {
	const st = getSubtask(active.tid, active.sid);
	st.time = active.base + (Date.now() - active.startTime);
	save(); render();
  }
  requestAnimationFrame(tick);
}
tick();

function getSubtask(tid, sid) {
  return tasks.find(t => t.id===tid).subtasks.find(s => s.id===sid);
}

// ===== Gestures: Swipe =====
(function enableSwipes(){
  const host = listEl;
  let activeRow=null, startX=0, dx=0;

  host.addEventListener("touchstart", e=>{
	const fore = e.target.closest(".swipe-fore");
	if(!fore) return;
	activeRow = fore;
	startX = e.touches[0].clientX;
  }, {passive:true});

  host.addEventListener("touchmove", e=>{
	if(!activeRow) return;
	dx = e.touches[0].clientX - startX;
	activeRow.style.transform = `translateX(${dx}px)`;
	e.preventDefault();
  }, {passive:false});

  host.addEventListener("touchend", e=>{
	if(!activeRow) return;
	if (dx < -64) {
	  // left swipe delete
	  const ids = activeRow.parentElement.id.split("-");
	  openDeleteModal(parseInt(ids[1]), parseInt(ids[2]));
	} else if (dx > 64) {
	  // right swipe toggle timer
	  const ids = activeRow.parentElement.id.split("-");
	  toggleTimer(parseInt(ids[1]), parseInt(ids[2]));
	}
	activeRow.style.transform = "";
	activeRow = null; dx=0;
  });
})();

// ===== Gestures: Drag reorder (tasks only for now) =====
(function enableReorder(){
  let dragging=null, ph=null;
  listEl.addEventListener("pointerdown", e=>{
	const card = e.target.closest(".card");
	if(!card) return;
	dragging = card;
	ph = document.createElement("div");
	ph.style.height = card.offsetHeight+"px";
	card.parentNode.insertBefore(ph, card.nextSibling);
	card.style.opacity = "0.7";
	card.setPointerCapture(e.pointerId);
	e.preventDefault();

	card.addEventListener("pointermove", onMove);
	card.addEventListener("pointerup", onUp, {once:true});
  });
  function onMove(e){
	dragging.style.transform = `translateY(${e.movementY}px)`;
	const rect = ph.getBoundingClientRect();
	const next = ph.nextElementSibling;
	if(next && e.clientY > rect.bottom) {
	  ph.parentNode.insertBefore(ph, next.nextSibling);
	}
	const prev = ph.previousElementSibling;
	if(prev && e.clientY < rect.top) {
	  ph.parentNode.insertBefore(ph, prev);
	}
  }
  function onUp(){
	ph.parentNode.insertBefore(dragging, ph);
	ph.remove();
	dragging.style.opacity="";
	dragging.style.transform="";
	dragging = null;
	// update state order
	const ids = [...listEl.querySelectorAll(".card")].map(c=>parseInt(c.id.split("-")[1]));
	tasks.sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
	save(); render();
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
