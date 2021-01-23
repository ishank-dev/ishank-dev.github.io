// This can be used to set the Particles Effects. Check README for more details!
document.addEventListener(
  "DOMContentLoaded",
  function () {
    particleground(document.getElementById("particles"), {
      dotColor: "#5cbdaa",
      lineColor: "#5cbdaa",
    });
    var intro = document.getElementById("intro");
    intro.style.marginTop = -intro.offsetHeight / 2 + "px";
  },
  false
);
