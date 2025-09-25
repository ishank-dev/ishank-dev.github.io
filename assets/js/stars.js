// Create animated stars for space theme
function createStars() {
  const starsContainer = document.getElementById('stars');
  const area = window.innerWidth * window.innerHeight;
  // Roughly 1 star per 10k px², clamped between 120 and 400
  const numberOfStars = Math.max(120, Math.min(400, Math.floor(area / 10000)));
  
  for (let i = 0; i < numberOfStars; i++) {
    const star = document.createElement('div');
    star.className = 'star';
    
    // Random position
    star.style.left = Math.random() * 100 + '%';
    star.style.top = Math.random() * 100 + '%';
    
    // Random animation duration
    star.style.animationDuration = (Math.random() * 3 + 2) + 's';
    
    // Random size
    const size = Math.random() * 2.5 + 0.5;
    star.style.width = size + 'px';
    star.style.height = size + 'px';
    
    // Random opacity - more subtle
    star.style.opacity = Math.random() * 0.6 + 0.15;
    
    starsContainer.appendChild(star);
  }
}

// Create shooting stars occasionally
function createShootingStar() {
  const shootingStar = document.createElement('div');
  shootingStar.className = 'shooting-star';
  shootingStar.style.left = Math.random() * 100 + '%';
  shootingStar.style.top = Math.random() * 50 + '%';
  
  document.getElementById('stars').appendChild(shootingStar);
  
  // Remove after animation
  setTimeout(() => {
    shootingStar.remove();
  }, 3000);
}

// Initialize stars when page loads
document.addEventListener('DOMContentLoaded', () => {
  createStars();
  
  // Disable shooting stars for cleaner look
  // setInterval(createShootingStar, 5000);
});

// Add hover effect to tech items
document.addEventListener('DOMContentLoaded', () => {
  const techItems = document.querySelectorAll('.tech-item');
  
  techItems.forEach(item => {
    item.addEventListener('click', function() {
      // Add a pulse effect
      this.style.transform = 'scale(0.95)';
      setTimeout(() => {
        this.style.transform = '';
      }, 100);
    });
  });
});
