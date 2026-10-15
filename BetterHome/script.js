document.addEventListener("DOMContentLoaded", () => {
  const searchEngineSpans = document.querySelectorAll(".search_engines");
  searchEngineSpans.forEach((span) => {
    const radio = span.querySelector('input[type="radio"]');
    const image = span.querySelector("img");

    if (image && radio) {
      image.addEventListener("click", () => {
        radio.checked = true;
      });
    }
  });

  const form = document.querySelector("form");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    search();
  });
});

function search() {
  var query = document.getElementById("query_string").value;
  if (query.trim() === "") {
    return;
  }

  var engine = document.querySelector('input[name="company"]:checked').value;
  var searchURL = "";

  if (engine === "brave") {
    searchURL = `https://search.brave.com/search?q=${encodeURIComponent(
      query
    )}`;
  } else if (engine === "duckduckgo") {
    searchURL = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  } else if (engine === "mojeek") {
    searchURL = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
  }

  window.location.href = searchURL;
}
