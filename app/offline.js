const site = new URLSearchParams(location.search).get("site");
document.getElementById("retry").addEventListener("click", () => {
  if (site && /^https?:\/\//.test(site)) location.href = site;
});
