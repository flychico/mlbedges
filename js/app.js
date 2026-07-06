function renderNav(active) {
  const links = [
    ["index.html", "Home"],
    ["previews/", "Previews"],
    ["process.html", "Process"],
    ["results.html", "Results"],
    ["membership.html", "Membership"]
  ];
  const el = document.getElementById("nav");
  if (!el) return;
  el.innerHTML = '<div class="nav-inner">'
    + '<a class="brand" href="/index.html"><span class="brand-ly">Ly</span><span class="brand-dia">Dia</span></a>'
    + links.map(function (l) {
        const href = l[0].startsWith("/") ? l[0] : "/" + l[0];
        return '<a class="navlink' + (l[0] === active ? ' active' : '') + '" href="' + href + '">' + l[1] + '</a>';
      }).join("")
    + '</div>';
}

function renderFooter() {
  const el = document.getElementById("footer");
  if (!el) return;
  el.innerHTML = "LyDia provides analysis and education only. Nothing here is betting, financial, or investment advice. No pick is guaranteed. Please bet responsibly. If gambling stops being fun, call 1-800-GAMBLER.";
}
