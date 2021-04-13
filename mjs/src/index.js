// import "./styles.css";
// import * as markerjs2 from "markerjs2";


function showMarkerArea(target) {
  const markerArea = new markerjs2.MarkerArea(target);
  markerArea.addRenderEventListener((imgURL) => (target.src = imgURL));
  markerArea.show();
}

const sampleImage = document.getElementById("sampleImage");
sampleImage.addEventListener("click", () => {
  showMarkerArea(sampleImage);
});
