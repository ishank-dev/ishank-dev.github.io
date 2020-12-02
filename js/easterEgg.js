var count = 0;
function toggle() {
  count+=1;
  var score = 0
if(count == 3){
  alert('Congratulations! You have unlocked an easter egg')
  init();
  newContent = document.querySelector('.summary');
  message = '<h1>Pokemon Easter Egg</h1><img id = "party" src = "https://emojis.slackmojis.com/emojis/images/1563480763/5999/meow_party.gif?1563480763"><p>Use the arrow keys on your keyboard to move move your pikachu around</p>'
  newContent.innerHTML = message;

  var x = document.getElementById('musicMario');
  x.play();
  
  var y = document.getElementById('music');
  y.pause();
  
  pikachu = document.getElementById("player");
  coin = document.getElementById("coin")
  
  document.getElementById('score').style.display = 'block';
  
  if(pikachu.style.display == 'block'){
	pikachu.style.display = 'none';
  }
  else{
	pikachu.style.display = 'block'
  }
  if(coin.style.display == 'block'){
	coin.style.display = 'none';
  }
  else{
	coin.style.display = 'block'
  }
}
else{
  var el = document.getElementById("stylesheet1");
	if (el.href.match("css/style_dark.css")) {
	  el.href = "css/style.css";

	}
	else {
	  el.href = "css/style_dark.css";

	}
  }

}

function isTouching(a, b) {
	const aRect = a.getBoundingClientRect();
	const bRect = b.getBoundingClientRect();

	return !(
		aRect.top + aRect.height < bRect.top ||
		aRect.top > bRect.top + bRect.height ||
		aRect.left + aRect.width < bRect.left ||
		aRect.left > bRect.left + bRect.width
	);
}
var score = 0;
const init = () => {
	const avatar = document.querySelector('#player');
    const coin = document.querySelector('#coin');
	moveCoin();
	window.addEventListener('keyup', function(e) {
		if (e.key === 'ArrowDown' || e.key === 'Down') {
			moveVertical(avatar, 50);
		}
		else if (e.key === 'ArrowUp' || e.key === 'Up') {
			moveVertical(avatar, -50);
		}
		else if (e.key === 'ArrowRight' || e.key === 'Right') {
			moveHorizontal(avatar, 50);
			avatar.style.transform = 'scale(1,1)';
		}
		else if (e.key === 'ArrowLeft' || e.key === 'Left') {
			moveHorizontal(avatar, -50);
			avatar.style.transform = 'scale(-1,1)';
		}
		if (isTouching(avatar, coin)){
            score+=1;
            title = document.getElementById('score');
            title.innerHTML = '<h2>Score: '+score+'</h2>'
            moveCoin();
        } 
	});
};

const moveVertical = (element, amount) => {
	const currTop = extractPos(element.style.top);
	element.style.top = `${currTop + amount}px`;
};
const moveHorizontal = (element, amount) => {
	const currLeft = extractPos(element.style.left);
	element.style.left = `${currLeft + amount}px`;
};

const extractPos = (pos) => {
	if (!pos) return 100;
	return parseInt(pos.slice(0, -2));
};

const moveCoin = () => {
	const x = Math.floor(Math.random() * 1000);
	const y = Math.floor(Math.random() * 500);
	coin.style.top = `${y}px`;
    coin.style.left = `${x}px`;   
    console.log(x,y); 
};
