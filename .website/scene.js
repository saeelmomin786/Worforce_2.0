import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
let target=0,draw;
export function setStage(index){target=index;draw?.();}
export function initScene(host){
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.setClearColor(0,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.1,100);camera.position.set(6,7.5,10);camera.lookAt(0,0,0);
 scene.add(new THREE.HemisphereLight(0xffffff,0x8393b0,3));const light=new THREE.DirectionalLight(0xffffff,4);light.position.set(-3,8,5);light.castShadow=true;light.shadow.mapSize.set(1024,1024);scene.add(light);
 const group=new THREE.Group();group.scale.setScalar(1.22);scene.add(group);const white=new THREE.MeshStandardMaterial({color:0xe5ecf7,metalness:.35,roughness:.34});const blue=new THREE.MeshStandardMaterial({color:0x215bd7,metalness:.3,roughness:.22});
 const base=new THREE.Mesh(new RoundedBoxGeometry(7,.18,4.1,4,.12),white);base.receiveShadow=true;base.position.y=-.5;group.add(base);
 const positions=[[-2.3,0,0],[0,0,-1.1],[0,0,1.1],[2.3,0,0]];const tiles=[];
 function label(text){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle='#253e60';ctx.font='500 42px Arial';ctx.textAlign='center';ctx.fillText(text,256,95);const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));sprite.scale.set(1.65,.52,1);return sprite;}
 positions.forEach((p,i)=>{const tile=new THREE.Mesh(new RoundedBoxGeometry(1.45,.4,1.18,5,.12),white.clone());tile.position.set(...p);tile.castShadow=true;tile.receiveShadow=true;group.add(tile);tiles.push(tile);const screen=new THREE.Mesh(new RoundedBoxGeometry(1.24,.85,.09,4,.08),new THREE.MeshPhysicalMaterial({color:0xd8e8ff,metalness:.15,roughness:.18,transparent:true,opacity:.78}));screen.position.set(p[0],.7,p[2]-.25);screen.rotation.x=-.15;screen.castShadow=true;group.add(screen);const caption=label(['Your request','Research','Draft','Your approval'][i]);caption.position.set(p[0],1.5,p[2]);group.add(caption);});
 [[0,1],[0,2],[1,3],[2,3]].forEach(([a,b])=>{const from=new THREE.Vector3(...positions[a]),to=new THREE.Vector3(...positions[b]);from.y=to.y=-.28;const mid=from.clone().lerp(to,.5);const curve=new THREE.QuadraticBezierCurve3(from,mid,to);const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,20,.018,8,false),blue);group.add(mesh);});
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');let current=0,frame=0;
 const render=()=>{cancelAnimationFrame(frame);current=reduce.matches?target:current+(target-current)*.14;tiles.forEach((tile,i)=>{const active=(target===0&&i===0)||(target===1&&(i===1||i===2))||(target===2&&i===3);tile.material.color.lerp(new THREE.Color(active?0x215bd7:0xfafcff),reduce.matches?1:.2);});group.rotation.y=(current-1)*.09;renderer.render(scene,camera);if(!reduce.matches&&Math.abs(current-target)>.001)frame=requestAnimationFrame(render);};draw=()=>{current+=.001;render();};
 const resize=()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();};host.replaceChildren(renderer.domElement);new ResizeObserver(resize).observe(host);resize();
}
