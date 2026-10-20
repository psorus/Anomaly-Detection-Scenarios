/* ---------- Init ---------- */
$("#c-scen").textContent = SC.length;
$("#c-apps").textContent = APPS.length;
$("#c-ds").textContent = DS.length;
let initial = "scenarios";
try { const h = (location.hash || "").replace("#", ""); initial = VIEWS.includes(h) ? h : load("view", "scenarios"); } catch (e) { initial = load("view", "scenarios"); }
setView(initial, { keepScroll: true });
})();
