document.addEventListener('DOMContentLoaded', () => {
  /* ---------- SETUP ---------- */
  const importMap = document.createElement('script');
  importMap.type = 'importmap';
  importMap.textContent = JSON.stringify({
    imports: {
      "three": "https://cdn.jsdelivr.net/npm/three@0.163.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.163.0/examples/jsm/"
    }
  });
  document.head.appendChild(importMap);

  /* Wait for import map to be processed */
  setTimeout(() => {
    import('three').then(THREE => {
      import('three/addons/controls/OrbitControls.js').then(({ OrbitControls }) => {
        setupSolarSystem(THREE, OrbitControls);
      });
    });
  }, 100);
});

function setupSolarSystem(THREE, OrbitControls) {
  /* ---------- BASIC SETUP ---------- */
  const renderer = new THREE.WebGLRenderer({canvas:document.getElementById('c'),antialias:true});
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(devicePixelRatio);
  renderer.physicallyCorrectLights = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.75;

  const scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60,innerWidth/innerHeight,0.1,3000);
  camera.position.set(0,60,160);

  const controls = new OrbitControls(camera,renderer.domElement);
  controls.enableDamping = true;

  /* ---------- LIGHTING ---------- */
  scene.add(new THREE.AmbientLight(0xffffff,0.18));
  const sunLight = new THREE.PointLight(0xffffff,10000,0,2);
  sunLight.position.set(0,0,0);
  scene.add(sunLight);

  /* ---------- STARS BACKDROP ---------- */
  (() => {
    const starGeo = new THREE.BufferGeometry();
    const starCnt = 6000; const pos=new Float32Array(starCnt*3);
    for(let i=0;i<starCnt;i++){const r=THREE.MathUtils.randFloat(400,1200);const t=Math.random()*Math.PI*2;const p=Math.acos(THREE.MathUtils.randFloatSpread(2));pos[3*i]=r*Math.sin(p)*Math.cos(t);pos[3*i+1]=r*Math.sin(p)*Math.sin(t);pos[3*i+2]=r*Math.cos(p);}starGeo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0xffffff,size:1,sizeAttenuation:false})));
  })();

  /* ---------- SUN ---------- */
  (() => {
    const geo=new THREE.SphereGeometry(8,64,32); // bigger sun
    const mat=new THREE.MeshBasicMaterial({color:0xffff66}); // natural yellow
    const sun=new THREE.Mesh(geo,mat);scene.add(sun);
    // glow sprite
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');const g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,240,180,.9)');g.addColorStop(.6,'rgba(255,200,80,.4)');g.addColorStop(1,'rgba(255,150,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,blending:THREE.AdditiveBlending}));sprite.scale.set(30,30,1);sun.add(sprite);
  })();

  /* ---------- PLANETS ---------- */
  const planetMeshes = {};
  const planetParams = [
    {name:'Mercury',size:0.8,dist:6,speed:4.15,axial:0.03,retro:false},
    {name:'Venus',  size:1.9,dist:12,speed:1.62,axial:177*Math.PI/180,retro:true},
    {name:'Earth',  size:2,  dist:18,speed:1,   axial:23.5*Math.PI/180,retro:false},
    {name:'Mars',   size:1.06,dist:28,speed:0.53,axial:25*Math.PI/180,retro:false},
    {name:'Jupiter',size:6,  dist:50,speed:0.084,axial:3.1*Math.PI/180,retro:false},
    {name:'Saturn', size:5.4,dist:78,speed:0.034,axial:26.7*Math.PI/180,retro:false},
    {name:'Uranus', size:2.4,dist:105,speed:0.012,axial:97*Math.PI/180,retro:true},
    {name:'Neptune',size:2.4,dist:135,speed:0.006,axial:28.3*Math.PI/180,retro:false}
  ];

  const defaultColor = new THREE.Color('#1e90ff'); // bright ocean blue

  function createPlanet(p) {
    const geo=new THREE.SphereGeometry(p.size,48,24);
    const mat=new THREE.MeshStandardMaterial({color:defaultColor,roughness:0.5,metalness:0.1});
    const mesh=new THREE.Mesh(geo,mat);
    mesh.userData={angle:Math.random()*Math.PI*2,...p};
    mesh.rotation.z=p.axial;
    scene.add(mesh); planetMeshes[p.name]=mesh;
    // orbit
    const pts=[];for(let i=0;i<=128;i++){const t=i/128*2*Math.PI;pts.push(new THREE.Vector3(p.dist*Math.cos(t),0,p.dist*Math.sin(t)));}
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x444444})));
    // Saturn rings
    if(p.name==='Saturn'){
      const rg=new THREE.RingGeometry(p.size*1.25,p.size*2.2,128,1);rg.rotateX(Math.PI/2);
      const rm=new THREE.MeshStandardMaterial({color:0xbbbbbb,side:THREE.DoubleSide,transparent:true,opacity:0.7});
      mesh.add(new THREE.Mesh(rg,rm));
    }
  }

  planetParams.forEach(createPlanet);

  /* ---------- MOON ---------- */
  (() => {
    const earth=planetMeshes.Earth;
    const geo=new THREE.SphereGeometry(0.54,32,16); // moon also bigger
    const mat=new THREE.MeshStandardMaterial({color:0x888888,roughness:0.7});
    const moon=new THREE.Mesh(geo,mat);
    moon.userData={angle:Math.random()*Math.PI*2,dist:4.8,speed:2.2,planet:earth,name:'Moon'};
    scene.add(moon); planetMeshes.Moon=moon;
  })();

  /* ---------- UI CONTROLS ---------- */
  const planetSelect=document.getElementById('planetSelect');
  Object.keys(planetMeshes).filter(n=>n!=='Moon').forEach(name=>{
    const opt=document.createElement('option');opt.value=name;opt.textContent=name;planetSelect.appendChild(opt);
  });
  const colorPicker=document.getElementById('colorPicker');
  planetSelect.addEventListener('change',()=>{
    const mesh=planetMeshes[planetSelect.value];
    colorPicker.value='#'+mesh.material.color.getHexString();
  });
  colorPicker.addEventListener('input',e=>{
    const mesh=planetMeshes[planetSelect.value];
    mesh.material.color.set(e.target.value);
  });
  // initialise picker display
  planetSelect.dispatchEvent(new Event('change'));

  /* ---------- TIMESCALE ---------- */
  const timeRange=document.getElementById('timeRange');
  let timeScale=parseFloat(timeRange.value);
  timeRange.addEventListener('input',e=>timeScale=parseFloat(e.target.value));

  /* ---------- ANIMATE ---------- */
  const clock=new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt=clock.getDelta()*timeScale;
    Object.values(planetMeshes).forEach(m=>{
      if(m.userData.dist){ // planets
        m.userData.angle+=m.userData.speed*dt;
        m.position.set(
          m.userData.dist*Math.cos(m.userData.angle),0,
          m.userData.dist*Math.sin(m.userData.angle)
        );
        m.rotation.y += (m.userData.retro?-1:1)*0.5*dt;
      } else if(m.userData.planet){ // moon
        const {planet,dist}=m.userData;
        m.userData.angle += m.userData.speed*dt;
        m.position.set(
          planet.position.x + dist*Math.cos(m.userData.angle),0,
          planet.position.z + dist*Math.sin(m.userData.angle)
        );
        m.rotation.y += 0.001;
      }
    });
    controls.update();
    renderer.render(scene,camera);
  }
  animate();

  /* ---------- RESIZE ---------- */
  addEventListener('resize',()=>{
    camera.aspect=innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  });
}