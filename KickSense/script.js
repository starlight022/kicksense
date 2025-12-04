const toeArea = document.querySelector('.hit-toe');
const insideArea = document.querySelector('.hit-inside');
const lacesArea = document.querySelector('.hit-laces');
const toggleButton = document.getElementById('toggle-sim');

let simInterval = null;

function pressureToColor(value) {
  const clamped = Math.min(Math.max(value, 0), 1);
  const hueGreen = 138;
  const hueYellow = 50;
  const hueRed = 0;

  let hue;
  if (clamped < 0.5) {
    const t = clamped / 0.5;
    hue = hueGreen + (hueYellow - hueGreen) * t;
  } else {
    const t = (clamped - 0.5) / 0.5;
    hue = hueYellow + (hueRed - hueYellow) * t;
  }

  const saturation = 85;
  const lightness = 52 + clamped * 10;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function applyPressureStyles(area, value) {
  if (!area) return;
  const color = pressureToColor(value);
  area.style.background = `radial-gradient(circle at center, ${color} 0%, rgba(12, 20, 27, 0.7) 70%)`;
  const scale = 0.95 + value * 0.15;
  area.style.transform = `scale(${scale})`;
  area.style.boxShadow = `0 0 ${14 + value * 22}px rgba(13, 242, 119, ${0.25 + value * 0.35})`;
  area.setAttribute('aria-label', `${area.dataset.label} trykk: ${(value * 100).toFixed(0)}%`);
}

function updateHeatmap(toe, inside, laces) {
  applyPressureStyles(toeArea, toe);
  applyPressureStyles(insideArea, inside);
  applyPressureStyles(lacesArea, laces);
}

function simulateHit() {
  const toe = Math.random();
  const inside = Math.random();
  const laces = Math.random();
  updateHeatmap(toe, inside, laces);
}

function startSimulation() {
  if (simInterval) return;
  simulateHit();
  simInterval = setInterval(simulateHit, 500);
  if (toggleButton) {
    toggleButton.classList.add('is-active');
    toggleButton.textContent = 'Pause simulering';
  }
}

function stopSimulation() {
  if (!simInterval) return;
  clearInterval(simInterval);
  simInterval = null;
  if (toggleButton) {
    toggleButton.classList.remove('is-active');
    toggleButton.textContent = 'Simuler treff';
  }
}

if (toggleButton) {
  toggleButton.addEventListener('click', () => {
    if (simInterval) {
      stopSimulation();
    } else {
      startSimulation();
    }
  });
}

startSimulation();

// Function to handle collapsible section behavior
function initCollapsibleSection(titleId, contentElement) {
  const title = document.getElementById(titleId);

  if (title) {
    title.addEventListener('click', function() {
      const content = contentElement;
      const arrow = this.querySelector('.arrow');
      const isOpen = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', !isOpen);

      if (isOpen) {
        // Closing
        content.style.opacity = 0;
        content.style.maxHeight = '0';
        content.style.transform = 'translateY(-4px)';
        this.classList.remove('active');
      } else {
        // Opening
        content.style.opacity = 1;
        content.style.maxHeight = content.scrollHeight + 'px';
        content.style.transform = 'translateY(0)';
        this.classList.add('active');
      }

      if (arrow) {
        arrow.style.transform = isOpen ? 'rotate(-45deg)' : 'rotate(45deg)';
      }
    });
  }
}

// Initialize collapsible sections
initCollapsibleSection('how-title', document.querySelector('.how-it-works .collapsible-content'));
initCollapsibleSection('why-title', document.querySelector('.why-it-matters .collapsible-content'));

// Expose updateHeatmap globally for external use (e.g., when connecting to Arduino serial)
window.updateHeatmap = updateHeatmap;

// 3D Model Loading with Three.js (ES Module)
let scene3D, camera3D, renderer3D, shoeModel3D = null;
let animationFrameId = null;

async function init3DScene() {
  const container = document.getElementById('shoe-3d-container');
  if (!container) return;
  
  try {
    // Dynamically import Three.js modules
    const THREE = await import('three');
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    
    // Get container dimensions
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Create scene
    scene3D = new THREE.Scene();
    scene3D.background = null; // Transparent background
    
    // Create camera
    camera3D = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera3D.position.set(0, 0.5, 2);
    camera3D.lookAt(0, 0, 0);
    
    // Create renderer
    renderer3D = new THREE.WebGLRenderer({ 
      alpha: true, 
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer3D.setSize(width, height);
    renderer3D.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer3D.shadowMap.enabled = false;
    
    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene3D.add(ambientLight);
    
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight1.position.set(2, 2, 2);
    scene3D.add(directionalLight1);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-2, 1, -2);
    scene3D.add(directionalLight2);
    
    // Insert canvas into container (hide SVG placeholder)
    const svgPlaceholder = container.querySelector('.loading-fallback');
    if (svgPlaceholder) {
      svgPlaceholder.style.display = 'none';
    }
    container.appendChild(renderer3D.domElement);
    
    // Load GLB model
    const loader = new GLTFLoader();
    loader.load(
      'unused_blue_vans_shoe.glb',
      (gltf) => {
        shoeModel3D = gltf.scene;
        
        // Calculate bounding box to center and scale the model
        const box = new THREE.Box3().setFromObject(shoeModel3D);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        // Center the model
        shoeModel3D.position.x = -center.x;
        shoeModel3D.position.y = -center.y;
        shoeModel3D.position.z = -center.z;
        
        // Scale to fit container (adjust scale factor as needed)
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.5 / maxDim;
        shoeModel3D.scale.multiplyScalar(scale);
        
        // Adjust camera to fit the model
        const cameraDistance = Math.max(size.x, size.y, size.z) * 1.8;
        camera3D.position.set(0, cameraDistance * 0.3, cameraDistance * 0.9);
        camera3D.lookAt(0, 0, 0);
        
        scene3D.add(shoeModel3D);
        
        // Start animation loop
        animate3D();
        
        // Handle window resize
        function onWindowResize() {
          const width = container.clientWidth;
          const height = container.clientHeight;
          camera3D.aspect = width / height;
          camera3D.updateProjectionMatrix();
          renderer3D.setSize(width, height);
        }
        window.addEventListener('resize', onWindowResize);
      },
      (progress) => {
        // Loading progress (optional)
        if (progress.lengthComputable) {
          console.log('Loading progress:', (progress.loaded / progress.total * 100) + '%');
        }
      },
      (error) => {
        console.error('Error loading GLB model:', error);
        // Show SVG placeholder if loading fails
        const svgPlaceholder = container.querySelector('.loading-fallback');
        if (svgPlaceholder) {
          svgPlaceholder.style.display = 'block';
        }
      }
    );
  } catch (error) {
    console.error('Error initializing 3D scene:', error);
    // Show SVG placeholder if initialization fails
    const svgPlaceholder = container.querySelector('.loading-fallback');
    if (svgPlaceholder) {
      svgPlaceholder.style.display = 'block';
    }
  }
}

// Animation loop with rotation
function animate3D() {
  animationFrameId = requestAnimationFrame(animate3D);
  
  // Rotate the shoe model around Y-axis (vertical rotation)
  if (shoeModel3D) {
    shoeModel3D.rotation.y += 0.01; // Adjust speed (0.01 = slow, 0.02 = faster)
  }
  
  // Render the scene
  if (renderer3D && scene3D && camera3D) {
    renderer3D.render(scene3D, camera3D);
  }
}

// Initialize 3D scene when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init3DScene);
} else {
  init3DScene();
}
