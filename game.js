/**
 * Bobo's Adventure Game
 * * A multi-level 2D platformer with scrolling, progressive difficulty,
 * sound effects, responsive design with swipe controls.
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const gameContainer = document.getElementById('gameContainer'); // Get container for resizing
    const messagesDiv = document.getElementById('messages');
    const startButton = document.getElementById('startButton');
    const heartsDisplay = document.getElementById('hearts');
    const carrotsCollectedDisplay = document.getElementById('carrotsCollected');
    const totalCarrotsDisplay = document.getElementById('totalCarrotsInLevel');
    // Note: References to old touch buttons (touchLeft, etc.) are effectively removed
    // as they are no longer used by the event listeners below.

    // --- Game Constants ---
    const INTERNAL_WIDTH = 800;  // Fixed internal resolution width
    const INTERNAL_HEIGHT = 400; // Fixed internal resolution height
    const ASPECT_RATIO = INTERNAL_WIDTH / INTERNAL_HEIGHT; // 2:1
    canvas.width = INTERNAL_WIDTH; // Set internal canvas size
    canvas.height = INTERNAL_HEIGHT;

    const GRAVITY = 0.6;
    const PLAYER_SPEED = 3.5; // Base speed when walking
    const PLAYER_RUN_SPEED = 6; // Max speed when running/swiping fast
    const JUMP_FORCE = 13;      // Base jump force
    const MAX_JUMP_BOOST = 4;   // Additional force for strong swipe up
    const MIN_JUMP_HEIGHT = 5;  // Minimum jump velocity if swipe is short
    const INVINCIBILITY_DURATION = 2000; // ms
    const MAX_LIVES = 5;

    // --- Touch Control Constants ---
    const SWIPE_THRESHOLD_X = 20;  // Min horizontal distance for swipe movement
    const SWIPE_THRESHOLD_Y_JUMP = -40; // Min *negative* vertical distance for jump swipe
    const SWIPE_THRESHOLD_Y_CROUCH = 40; // Min positive vertical distance for crouch swipe
    const MAX_SWIPE_SPEED_DIST_X = 150; // Horizontal distance at which max speed is reached (currently unused, running is binary)

    // --- Game State Variables ---
    let cameraX = 0;
    let player = null;
    let platforms = [];
    let carrots = [];
    let enemies = [];
    let exit = null;
    let keys = {}; // Still used internally for keyboard AND touch simulation
    let lives = 3;
    let requiredCarrots = 0;
    let collectedCarrotsCount = 0;
    let isGameOver = false;
    let gameStarted = false;
    let isInvincible = false;
    let invincibilityTimer = 0;
    let currentSpeed = PLAYER_SPEED; // Player's current max horizontal speed
    let gameLoopId = null;
    let soundsInitialized = false;
    let currentLevelIndex = 0;
    let currentLevelData = null;

    // --- Touch State Variables ---
    let touchStartX = 0;
    let touchStartY = 0;
    let touchCurrentX = 0;
    let touchCurrentY = 0;
    let isTouching = false;
    let touchId = null; // To track a specific finger
    let touchJumped = false; // Flag to prevent multiple jumps per swipe
    let touchCrouched = false; // Flag to prevent multiple crouches per swipe

    // --- Sound Effects Setup (Tone.js) ---
    const sounds = {
        jump: new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.05, release: 0.1 }, volume: -12 }).toDestination(),
        collect: new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.01, release: 0.1 }, volume: -10 }).toDestination(),
        hit: new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 }, volume: -8 }).toDestination(),
        stomp: new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.01, decay: 0.15, sustain: 0, release: 0.1 }, volume: -14 }).toDestination(),
        levelComplete: new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.3 }, volume: -11 }).toDestination(),
        gameOver: new Tone.Synth({ oscillator: { type: 'fatsawtooth', detune: 10, count: 2 }, envelope: { attack: 0.1, decay: 0.5, sustain: 0, release: 0.2 }, volume: -9 }).toDestination(),
        nextLevel: new Tone.Synth({ oscillator: { type: 'pulse', width: 0.3 }, envelope: { attack: 0.02, decay: 0.2, sustain: 0.1, release: 0.2 }, volume: -10 }).toDestination(),
        gameWin: new Tone.PolySynth(Tone.Synth, { oscillator: {type: "triangle"}, envelope: { attack: 0.1, decay: 0.5, sustain: 0.3, release: 0.5}, volume: -8}).toDestination(),
    };

    /**
     * Plays a predefined sound effect.
     * @param {string} soundName - The name of the sound to play (key in the sounds object).
     */
    function playSound(soundName) {
        if (!soundsInitialized || !sounds[soundName]) return;
        try {
            if (Tone.context.state !== 'running') Tone.context.resume();
            if (soundName === 'jump') sounds.jump.triggerAttackRelease('C5', '8n');
            else if (soundName === 'collect') sounds.collect.triggerAttackRelease('E6', '16n', Tone.now(), 0.8);
            else if (soundName === 'hit') sounds.hit.triggerAttackRelease('0.1');
            else if (soundName === 'stomp') sounds.stomp.triggerAttackRelease('G3', '8n');
            else if (soundName === 'levelComplete') sounds.levelComplete.triggerAttackRelease(['C4', 'E4', 'G4', 'C5'], '0.5n');
            else if (soundName === 'gameOver') sounds.gameOver.triggerAttackRelease('C3', '1n');
            else if (soundName === 'nextLevel') sounds.nextLevel.triggerAttackRelease('A4', '4n');
            else if (soundName === 'gameWin') sounds.gameWin.triggerAttackRelease(['C4', 'G4', 'C5', 'E5', 'G5'], '1n');
        } catch (error) { console.error("Error playing sound:", soundName, error); }
    }

    /**
     * Initializes the Tone.js audio context. Must be called after user interaction.
     */
    async function initializeSounds() {
        if (soundsInitialized) return;
        try {
            await Tone.start();
            soundsInitialized = true;
            console.log("Audio context started");
        } catch (e) {
            console.error("Could not start Tone.js audio context:", e);
        }
    }

    // --- Level Generation Helpers ---
    /** Generates platform objects for a level. */
    function generatePlatforms(levelWidth, yOffset, count, minWidth, maxWidth, minGap, maxGap, canBeMoving = false, movingChance = 0.2) {
        const plats = []; let currentX = 150;
        for (let i = 0; i < count; i++) {
            if (currentX > levelWidth - maxWidth - 50) break;
            const width = Math.random() * (maxWidth - minWidth) + minWidth;
            const yPos = INTERNAL_HEIGHT - (Math.random() * 100 + yOffset);
            let platform = { worldX: currentX, y: yPos, width: width, height: 20, color: '#6f4e37' };
            if (canBeMoving && Math.random() < movingChance) {
                platform.type = 'moving'; platform.speed = 0.5 + Math.random() * 1;
                platform.range = 30 + Math.random() * 50; platform.dir = Math.random() < 0.5 ? 1 : -1;
                platform.originalWorldX = currentX;
            }
            plats.push(platform); currentX += width + (Math.random() * (maxGap - minGap) + minGap);
        } return plats;
    }
    /** Generates carrot objects above platforms. */
    function generateCarrots(platforms, chance = 0.5) {
        const crts = [];
        platforms.forEach(p => {
            if (Math.random() < chance && p.width > 30) {
                 crts.push({ worldX: p.worldX + p.width / 2 - 7.5, y: p.y - 28, width: 15, height: 25, color: '#fd7e14', collected: false });
            }
        }); return crts;
    }
    /** Generates enemy objects. */
    function generateEnemies(levelWidth, count, yLevel, baseSpeed, patrolRangeWidth) {
        const enms = [];
        for (let i = 0; i < count; i++) {
            const startX = 200 + Math.random() * (levelWidth - patrolRangeWidth - 300);
            const patrolStart = Math.max(0, startX - patrolRangeWidth / 2);
            const patrolEnd = Math.min(levelWidth, startX + patrolRangeWidth / 2);
            enms.push({
                worldX: startX, y: INTERNAL_HEIGHT - yLevel, width: 40, height: 30, color: '#dc3545',
                speed: baseSpeed + Math.random() * 0.5, originalSpeed: baseSpeed + Math.random() * 0.5,
                direction: Math.random() < 0.5 ? 1 : -1,
                patrolRange: { start: patrolStart, end: patrolEnd }
            });
        } return enms;
    }

    // --- Level Data Definition ---
    // Define initial levels first
    const initialLevels = [
        // Level 1
        { width: 3200, bgColor: '#87CEEB', groundColor: '#28a745', platformColor: '#6f4e37', platforms: [ { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 400, height: 20 }, { worldX: 500, y: INTERNAL_HEIGHT - 20, width: 600, height: 20 }, { worldX: 1200, y: INTERNAL_HEIGHT - 20, width: 800, height: 20 }, { worldX: 2100, y: INTERNAL_HEIGHT - 20, width: 3200 - 2100, height: 20 }, { worldX: 150, y: INTERNAL_HEIGHT - 80, width: 100, height: 20 }, { worldX: 300, y: INTERNAL_HEIGHT - 140, width: 120, height: 20 }, { worldX: 550, y: INTERNAL_HEIGHT - 100, width: 150, height: 20 }, { worldX: 700, y: INTERNAL_HEIGHT - 180, width: 80, height: 20 }, { worldX: 850, y: INTERNAL_HEIGHT - 120, width: 100, height: 20 }, { worldX: 1000, y: INTERNAL_HEIGHT - 90, width: 130, height: 20 }, { worldX: 1150, y: INTERNAL_HEIGHT - 150, width: 100, height: 20 }, { worldX: 1300, y: INTERNAL_HEIGHT - 200, width: 120, height: 20 }, { worldX: 1500, y: INTERNAL_HEIGHT - 100, width: 150, height: 20 }, { worldX: 1600, y: INTERNAL_HEIGHT - 160, width: 70, height: 20, type: 'moving', speed: 1, range: 50, dir: 1, originalWorldX: 1600 }, { worldX: 1750, y: INTERNAL_HEIGHT - 130, width: 100, height: 20 }, { worldX: 1900, y: INTERNAL_HEIGHT - 70, width: 90, height: 20 }, { worldX: 2050, y: INTERNAL_HEIGHT - 140, width: 110, height: 20 }, { worldX: 2200, y: INTERNAL_HEIGHT - 190, width: 100, height: 20 }, { worldX: 2350, y: INTERNAL_HEIGHT - 100, width: 150, height: 20 }, { worldX: 2500, y: INTERNAL_HEIGHT - 150, width: 80, height: 20 }, { worldX: 2650, y: INTERNAL_HEIGHT - 220, width: 120, height: 20 }, { worldX: 2800, y: INTERNAL_HEIGHT - 120, width: 100, height: 20 }, { worldX: 2950, y: INTERNAL_HEIGHT - 170, width: 130, height: 20, type: 'moving', speed: 1.5, range: 70, dir: 1, originalWorldX: 2950 }], carrots: [ { worldX: 180, y: INTERNAL_HEIGHT - 105, width: 15, height: 25, color: '#fd7e14', collected: false }, { worldX: 350, y: INTERNAL_HEIGHT - 165, width: 15, height: 25, color: '#fd7e14', collected: false }, { worldX: 1350, y: INTERNAL_HEIGHT - 225, width: 15, height: 25, color: '#fd7e14', collected: false }, { worldX: 2250, y: INTERNAL_HEIGHT - 215, width: 15, height: 25, color: '#fd7e14', collected: false }, { worldX: 3000, y: INTERNAL_HEIGHT - 50, width: 15, height: 25, color: '#fd7e14', collected: false }], enemies: [ { worldX: 400, y: INTERNAL_HEIGHT - 50, width: 40, height: 30, color: '#dc3545', speed: 1, originalSpeed: 1, direction: 1, patrolRange: { start: 300, end: 500 }}, { worldX: 900, y: INTERNAL_HEIGHT - 50, width: 40, height: 30, color: '#dc3545', speed: 1.2, originalSpeed: 1.2, direction: 1, patrolRange: { start: 800, end: 1050 }}], exitY: INTERNAL_HEIGHT - 60, requiredCarrotsFraction: 0.6 },
        // Level 2
        { width: 3500, bgColor: '#34495e', groundColor: '#555', platformColor: '#4a4a4a', platforms: [ { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 300, height: 20 }, { worldX: 400, y: INTERNAL_HEIGHT - 20, width: 500, height: 20 }, { worldX: 1000, y: INTERNAL_HEIGHT - 20, width: 700, height: 20 }, { worldX: 1800, y: INTERNAL_HEIGHT - 20, width: 3500 - 1800, height: 20 }, ...generatePlatforms(3500, 70, 12, 60, 100, 80, 150, true, 0.3) ], carrots: [], enemies: generateEnemies(3500, 4, 50, 1.3, 200), exitY: INTERNAL_HEIGHT - 70, requiredCarrotsFraction: 0.7 },
        // Level 3
        { width: 4000, bgColor: '#e0f7fa', groundColor: '#c0c0c0', platformColor: '#add8e6', platforms: [ { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 200, height: 20 }, { worldX: 300, y: INTERNAL_HEIGHT - 20, width: 400, height: 20 }, { worldX: 800, y: INTERNAL_HEIGHT - 20, width: 600, height: 20 }, { worldX: 1500, y: INTERNAL_HEIGHT - 20, width: 4000 - 1500, height: 20 }, ...generatePlatforms(4000, 60, 15, 50, 90, 100, 180, true, 0.4) ], carrots: [], enemies: generateEnemies(4000, 5, 50, 1.5, 180), exitY: INTERNAL_HEIGHT - 60, requiredCarrotsFraction: 0.75 },
        // Level 4
        { width: 3800, bgColor: '#4a4e69', groundColor: '#22333b', platformColor: '#5e503f', platforms: [ { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 350, height: 20 }, { worldX: 450, y: INTERNAL_HEIGHT - 20, width: 550, height: 20 }, { worldX: 1100, y: INTERNAL_HEIGHT - 20, width: 750, height: 20 }, { worldX: 1950, y: INTERNAL_HEIGHT - 20, width: 3800 - 1950, height: 20 }, ...generatePlatforms(3800, 80, 14, 70, 110, 90, 160, true, 0.35) ], carrots: [], enemies: generateEnemies(3800, 6, 50, 1.4, 220), exitY: INTERNAL_HEIGHT - 65, requiredCarrotsFraction: 0.7 },
        // Level 5
        { width: 4200, bgColor: '#9db4c0', groundColor: '#778899', platformColor: '#5c6b73', platforms: [ { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 150, height: 20 }, { worldX: 500, y: INTERNAL_HEIGHT - 20, width: 200, height: 20 }, { worldX: 1200, y: INTERNAL_HEIGHT - 20, width: 180, height: 20 }, { worldX: 2000, y: INTERNAL_HEIGHT - 20, width: 250, height: 20 }, { worldX: 3800, y: INTERNAL_HEIGHT - 20, width: 4200 - 3800, height: 20 }, ...generatePlatforms(4200, 50, 18, 40, 80, 120, 200, true, 0.5) ], carrots: [], enemies: generateEnemies(4200, 7, 50, 1.6, 150), exitY: INTERNAL_HEIGHT - 80, requiredCarrotsFraction: 0.8 },
    ];

    // Now, create the final array using the initial levels
    const allLevelsData = [...initialLevels]; // Start with levels 1-5

    // Auto-generate levels 6-10 and push them
    const level5Data = allLevelsData[4]; // Base the generation on level 5 data
    for (let i = 1; i <= 5; i++) {
        const levelNum = i + 5; // Level numbers 6 through 10
        const newLevelWidth = level5Data.width + i * 200;
        const newBgColor = `hsl(${200 + i * 10}, 50%, ${60 - i * 2}%)`;
        const newGroundColor = `hsl(${120 + i * 5}, 30%, ${40 - i * 2}%)`;
        const newPlatformColor = `hsl(${30 + i * 5}, 30%, ${35 - i * 2}%)`;
        allLevelsData.push({ 
            width: newLevelWidth, bgColor: newBgColor, groundColor: newGroundColor, platformColor: newPlatformColor, 
            platforms: [ 
                { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 100 + i*10, height: 20 }, 
                { worldX: newLevelWidth - (100 + i*10), y: INTERNAL_HEIGHT - 20, width: 100 + i*10, height: 20 }, 
                ...generatePlatforms(newLevelWidth, 40 + i*5, 18 + i, 35 - i*2, 75 - i*3, 130 + i*10, 220 + i*10, true, 0.5 + i*0.05) 
            ], 
            carrots: [], // To be generated in loadLevel
            enemies: generateEnemies(newLevelWidth, 7 + i, 50, 1.6 + i * 0.1, 140 - i*5), 
            exitY: INTERNAL_HEIGHT - (80 + i*5), 
            requiredCarrotsFraction: Math.min(0.95, 0.8 + i * 0.03) 
        });
    }
    // Push the final boss level (Level 11)
    allLevelsData.push({ 
        width: 1000, bgColor: '#200000', groundColor: '#100000', platformColor: '#301010', 
        platforms: [ { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 1000, height: 20 } ], carrots: [], 
        enemies: [ { worldX: 450, y: INTERNAL_HEIGHT - 100, width: 100, height: 80, color: '#ff0000', speed: 0, originalSpeed: 0, direction: 1, patrolRange: {start: 450, end: 450}, isBoss: true } ], 
        exitY: INTERNAL_HEIGHT - 100, requiredCarrotsFraction: 0, isBossLevel: true 
    });


    /** Loads level data, resets player/camera, generates procedural elements. */
    function loadLevel(levelIndex) {
        if (levelIndex >= allLevelsData.length) { winGame(); return; }
        // Deep copy level data to prevent modifications affecting the original definition
        currentLevelData = JSON.parse(JSON.stringify(allLevelsData[levelIndex])); 

        // Initialize Level Elements
        currentLevelData.platforms.forEach(p => {
            if (!p.color) p.color = (p.y === INTERNAL_HEIGHT - 20) ? currentLevelData.groundColor : currentLevelData.platformColor;
            if (p.type === 'moving' && p.originalWorldX === undefined) p.originalWorldX = p.worldX;
        });
        if (currentLevelData.carrots.length === 0 && !currentLevelData.isBossLevel) {
            currentLevelData.carrots = generateCarrots(currentLevelData.platforms.filter(p => p.y < INTERNAL_HEIGHT - 20), 0.6);
        }
        currentLevelData.carrots.forEach(c => c.collected = false);
        platforms = currentLevelData.platforms; carrots = currentLevelData.carrots; enemies = currentLevelData.enemies;
        requiredCarrots = currentLevelData.isBossLevel ? 0 : Math.ceil(carrots.length * currentLevelData.requiredCarrotsFraction);
        exit = { worldX: currentLevelData.width - 100, y: currentLevelData.exitY || INTERNAL_HEIGHT - 60, width: 50, height: 50, color: '#6c757d', isOpen: false };
        
        // Reset Player State
        player = { worldX: 100, y: INTERNAL_HEIGHT - 100, width: 30, height: 40, drawWidth: 30, drawHeight: 40, color: '#007bff', velocityX: 0, velocityY: 0, isJumping: false, isOnGround: false, isCrouching: false, canVariableJump: false, jumpButtonPressedTime: 0 };
        collectedCarrotsCount = 0; cameraX = 0; currentSpeed = PLAYER_SPEED;
        isGameOver = false; gameStarted = true;
        
        updateHUD();
        messagesDiv.textContent = `שלב ${levelIndex + 1}`;
        setTimeout(() => { if (messagesDiv.textContent === `שלב ${levelIndex + 1}`) messagesDiv.textContent = ""; }, 1500);
    }

    /** Starts or restarts the game. */
    function startGame(startFreshGame = false) {
        if (startFreshGame) { currentLevelIndex = 0; lives = 3; }
        isGameOver = false; gameStarted = true;
        startButton.style.display = 'none'; messagesDiv.textContent = '';
        loadLevel(currentLevelIndex);
        if (!gameLoopId) gameLoop();
    }

    // --- Input Handling ---

    // Keyboard Input
    document.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') { if (gameStarted || isGameOver) { if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; } startGame(true); } return; }
        keys[e.key] = true; if (isGameOver || !gameStarted || !player) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const now = Date.now(); if (now - lastKeyPressTime[e.key] < DOUBLE_TAP_THRESHOLD) currentSpeed = PLAYER_RUN_SPEED; else currentSpeed = PLAYER_SPEED; lastKeyPressTime[e.key] = now; }
        if ((e.key === 'ArrowUp' || e.key === ' ') && player.isOnGround && !player.isJumping) { player.isJumping = true; player.isOnGround = false; player.velocityY = -JUMP_FORCE; player.canVariableJump = true; player.jumpButtonPressedTime = Date.now(); playSound('jump'); }
        if (e.key === 'ArrowDown' && !player.isCrouching && player.isOnGround) { player.isCrouching = true; player.drawHeight = 25; player.drawWidth = 35; }
    });
    document.addEventListener('keyup', (e) => {
        keys[e.key] = false; if (isGameOver || !gameStarted || !player) return;
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { if (!keys['ArrowLeft'] && !keys['ArrowRight']) currentSpeed = PLAYER_SPEED; }
        if ((e.key === 'ArrowUp' || e.key === ' ') && player.canVariableJump) { player.canVariableJump = false; if (player.velocityY < -MIN_JUMP_HEIGHT) { const pressDuration = Date.now() - player.jumpButtonPressedTime; if (pressDuration < 150) player.velocityY = -MIN_JUMP_HEIGHT * 1.5; } }
        if (e.key === 'ArrowDown' && player.isCrouching) { player.isCrouching = false; player.drawHeight = player.height; player.drawWidth = player.width; }
    });

    // Swipe Touch Input Handling
    /** Gets touch coordinates relative to the canvas element, scaled to internal resolution. */
    function getTouchPos(canvasDom, touchEvent) {
        const rect = canvasDom.getBoundingClientRect();
        const touch = touchEvent.changedTouches[0]; 
        return {
            x: (touch.clientX - rect.left) * (INTERNAL_WIDTH / canvasDom.clientWidth),
            y: (touch.clientY - rect.top) * (INTERNAL_HEIGHT / canvasDom.clientHeight)
        };
    }
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault(); 
        if (isGameOver || !gameStarted) return; 
        if (!isTouching) { 
            const pos = getTouchPos(canvas, e);
            touchStartX = pos.x; touchStartY = pos.y;
            touchCurrentX = pos.x; touchCurrentY = pos.y;
            isTouching = true; touchJumped = false; touchCrouched = false; 
            touchId = e.changedTouches[0].identifier; 
            if (!soundsInitialized) initializeSounds();
        }
    }, { passive: false }); 
    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!isTouching || isGameOver || !gameStarted || !player) return;
        let currentTouch = null;
        for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === touchId) { currentTouch = e.changedTouches[i]; break; } }
        if (!currentTouch) return; 
        const pos = getTouchPos(canvas, e); 
        touchCurrentX = pos.x; touchCurrentY = pos.y;
        const deltaX = touchCurrentX - touchStartX; const deltaY = touchCurrentY - touchStartY;
        // Horizontal Movement
        if (Math.abs(deltaX) > SWIPE_THRESHOLD_X) {
            if (deltaX > 0) { keys['ArrowRight'] = true; keys['ArrowLeft'] = false; } 
            else { keys['ArrowLeft'] = true; keys['ArrowRight'] = false; }
            currentSpeed = PLAYER_RUN_SPEED; 
        } else { keys['ArrowLeft'] = false; keys['ArrowRight'] = false; currentSpeed = PLAYER_SPEED; }
        // Vertical Movement (Jump/Crouch)
        if (deltaY < SWIPE_THRESHOLD_Y_JUMP && !touchJumped && player.isOnGround) { // Swipe Up
            player.isJumping = true; player.isOnGround = false;
            let jumpBoost = Math.min(MAX_JUMP_BOOST, Math.abs(deltaY + SWIPE_THRESHOLD_Y_JUMP) * 0.05);
            player.velocityY = -(JUMP_FORCE + jumpBoost);
            playSound('jump'); touchJumped = true; 
            keys['ArrowLeft'] = false; keys['ArrowRight'] = false; 
        } else if (deltaY > SWIPE_THRESHOLD_Y_CROUCH && !touchCrouched && player.isOnGround && !player.isCrouching) { // Swipe Down
            keys['ArrowDown'] = true; 
            player.isCrouching = true; player.drawHeight = 25; player.drawWidth = 35;
            touchCrouched = true; 
        }
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        let endedOurTouch = false;
        for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === touchId) { endedOurTouch = true; break; } }
        if (isTouching && endedOurTouch) {
            isTouching = false; touchId = null; 
            keys['ArrowLeft'] = false; keys['ArrowRight'] = false; keys['ArrowDown'] = false;
            if (touchCrouched && player && player.isCrouching) { player.isCrouching = false; player.drawHeight = player.height; player.drawWidth = player.width; }
            touchCrouched = false; touchJumped = false; 
            currentSpeed = PLAYER_SPEED; 
        }
    }, { passive: false });
    canvas.addEventListener('touchcancel', (e) => {
         let cancelledOurTouch = false;
         for (let i = 0; i < e.changedTouches.length; i++) { if (e.changedTouches[i].identifier === touchId) { cancelledOurTouch = true; break; } }
        if (isTouching && cancelledOurTouch) {
             isTouching = false; touchId = null;
             keys['ArrowLeft'] = false; keys['ArrowRight'] = false; keys['ArrowDown'] = false;
             if (touchCrouched && player && player.isCrouching) { player.isCrouching = false; player.drawHeight = player.height; player.drawWidth = player.width; }
             touchCrouched = false; touchJumped = false;
             currentSpeed = PLAYER_SPEED;
         }
    }, { passive: false });

    // --- Game Update Logic ---
    /** Updates the player's state. */
    function updatePlayer() { 
        if (isGameOver || !player || !currentLevelData) return; 
        player.velocityX = 0;
        if (keys['ArrowLeft'] && !player.isCrouching) player.velocityX = -currentSpeed;
        if (keys['ArrowRight'] && !player.isCrouching) player.velocityX = currentSpeed;
        player.worldX += player.velocityX;
        player.velocityY += GRAVITY; player.y += player.velocityY; player.isOnGround = false;
        if (player.worldX < 0) player.worldX = 0;
        if (player.worldX + player.width > currentLevelData.width) player.worldX = currentLevelData.width - player.width;
        if (player.y + player.height > INTERNAL_HEIGHT + 50) loseLife(true);
        if (isInvincible) { invincibilityTimer -= 1000/60; if (invincibilityTimer <= 0) isInvincible = false; }
    }
    /** Updates the camera position. */
    function updateCamera() { 
        if (!player || !currentLevelData) return;
        const displayWidth = canvas.clientWidth; 
        const targetCameraX = player.worldX - (displayWidth / 2 - player.width / 2); 
        cameraX += (targetCameraX - cameraX) * 0.1; 
        if (cameraX < 0) cameraX = 0;
        const maxCameraX = currentLevelData.width - displayWidth;
        if (maxCameraX < 0) { cameraX = 0; } 
        else if (cameraX > maxCameraX) { cameraX = maxCameraX; } 
    }
    /** Updates moving platforms. */
    function updatePlatforms() { 
        if (!platforms) return;
        platforms.forEach(p => {
            if (p.type === 'moving') {
                p.worldX += p.speed * p.dir;
                 if (p.dir === 1 && p.worldX >= p.originalWorldX + p.range) { p.worldX = p.originalWorldX + p.range; p.dir = -1; }
                 else if (p.dir === -1 && p.worldX <= p.originalWorldX) { p.worldX = p.originalWorldX; p.dir = 1; }
            }
        });
    }
    /** Updates enemies. */
    function updateEnemies() { 
        if (isGameOver || !enemies || !currentLevelData) return;
        enemies.forEach(enemy => {
            if (enemy.isBoss) return;
            const progressFactor = Math.min(1.5, 1 + (cameraX / currentLevelData.width) * 0.5);
            enemy.speed = enemy.originalSpeed * progressFactor * (1 + currentLevelIndex * 0.05); 
            enemy.worldX += enemy.speed * enemy.direction;
            if (enemy.worldX <= enemy.patrolRange.start || enemy.worldX + enemy.width >= enemy.patrolRange.end) enemy.direction *= -1;
        });
    }
    /** Gets the player's hitbox. */
    function getPlayerHitbox() { 
        if (!player) return {x:0,y:0,width:0,height:0};
        if (player.isCrouching) return { x: player.worldX, y: player.y + (player.height - player.drawHeight), width: player.drawWidth, height: player.drawHeight };
        return { x: player.worldX, y: player.y, width: player.width, height: player.height };
    }
    /** Checks all collisions. */
    function checkCollisions() { 
        if (isGameOver || !player || !platforms || !carrots || !enemies || !exit) return;
        const playerHitbox = getPlayerHitbox(); let onAnyPlatform = false; 
        platforms.forEach(platform => { const platformHitbox = { x: platform.worldX, y: platform.y, width: platform.width, height: platform.height }; if (isRectColliding(playerHitbox, platformHitbox)) { const prevPlayerBottom = (player.y + playerHitbox.height) - player.velocityY; if (player.velocityY >= 0 && prevPlayerBottom <= platform.y + 1) { player.y = platform.y - playerHitbox.height; player.velocityY = 0; player.isJumping = false; player.isOnGround = true; onAnyPlatform = true; if (platform.type === 'moving' && player.isOnGround) player.worldX += platform.speed * platform.dir; } else if (player.velocityY < 0 && player.y - player.velocityY >= platform.y + platform.height -1) { player.y = platform.y + platform.height; player.velocityY = 0; } else { if (player.velocityX > 0 && playerHitbox.x + playerHitbox.width - player.velocityX <= platform.worldX) { player.worldX = platform.worldX - playerHitbox.width; player.velocityX = 0; } else if (player.velocityX < 0 && playerHitbox.x - player.velocityX >= platform.worldX + platform.width) { player.worldX = platform.worldX + platform.width; player.velocityX = 0; } } } });
        carrots.forEach((carrot) => { if (!carrot.collected && isRectColliding(playerHitbox, {x: carrot.worldX, y: carrot.y, width: carrot.width, height: carrot.height})) { carrot.collected = true; collectedCarrotsCount++; playSound('collect'); updateHUD(); checkLevelCompletion(); } });
        enemies.forEach(enemy => { const enemyHitbox = { x: enemy.worldX, y: enemy.y, width: enemy.width, height: enemy.height }; if (isRectColliding(playerHitbox, enemyHitbox) && !isInvincible) { if (enemy.isBoss){ loseLife(); return; } const prevPlayerBottom = (player.y + playerHitbox.height) - player.velocityY; if (player.velocityY > 0 && prevPlayerBottom < enemy.y + 5 && !player.isCrouching) { enemies.splice(enemies.indexOf(enemy), 1); player.velocityY = -JUMP_FORCE / 1.5; player.isJumping = true; player.isOnGround = false; playSound('stomp'); } else loseLife(); } });
        if (exit && exit.isOpen && isRectColliding(playerHitbox, {x: exit.worldX, y: exit.y, width: exit.width, height: exit.height})) levelComplete(); // Added null check for exit
    }
    /** Basic rectangle collision check. */
    function isRectColliding(rect1, rect2) { 
        return rect1.x < rect2.x + rect2.width && rect1.x + rect1.width > rect2.x && rect1.y < rect2.y + rect2.height && rect1.y + rect1.height > rect2.y;
    }

    // --- Game State Management ---
    function loseLife(isFallDeath = false) { 
        if (isInvincible || isGameOver) return; lives--; playSound('hit'); isInvincible = true; invincibilityTimer = INVINCIBILITY_DURATION; updateHUD();
        if (lives <= 0) gameOver();
        else { if (isFallDeath) { player.worldX = Math.max(50, cameraX + 100); player.y = INTERNAL_HEIGHT - 200; } else { player.worldX = Math.max(50, player.worldX - 50); player.y = INTERNAL_HEIGHT - 100; } player.velocityX = 0; player.velocityY = 0; player.isCrouching = false; player.drawHeight = player.height; player.drawWidth = player.width; messagesDiv.textContent = "נפסלת! נסה שוב."; setTimeout(() => { if(!isGameOver && messagesDiv.textContent === "נפסלת! נסה שוב.") messagesDiv.textContent = ""; }, 2000); }
    }
    function gameOver() { 
        isGameOver = true; gameStarted = false; playSound('gameOver'); messagesDiv.innerHTML = `אוי לא, נגמרו החיים! <br> הגעת לשלב ${currentLevelIndex + 1}`; startButton.textContent = "שחק שוב מההתחלה"; startButton.style.display = 'block'; if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
    }
    function checkLevelCompletion() { 
        if (!currentLevelData) return; 
        let open = false;
        if (!currentLevelData.isBossLevel && collectedCarrotsCount >= requiredCarrots) open = true;
        if (currentLevelData.isBossLevel && enemies.length === 0) open = true; 
        if (open && exit) { exit.isOpen = true; exit.color = '#FFD700'; } 
    }
    function levelComplete() { 
        gameStarted = false; playSound('levelComplete'); currentLevelIndex++;
        if (currentLevelIndex >= allLevelsData.length) winGame();
        else { messagesDiv.textContent = `שלב ${currentLevelIndex} הושלם!`; startButton.textContent = `התחל שלב ${currentLevelIndex + 1}`; startButton.style.display = 'block'; playSound('nextLevel'); }
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
    }
    function winGame() { 
        isGameOver = true; gameStarted = false; playSound('gameWin'); messagesDiv.innerHTML = `כל הכבוד! ניצחת את המשחק! <br> סיימת את כל ${allLevelsData.length} השלבים!`; startButton.textContent = "שחק שוב מההתחלה"; startButton.style.display = 'block'; currentLevelIndex = 0; if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
    }
    function updateHUD() { 
        if (heartsDisplay) heartsDisplay.textContent = lives;
        if (carrotsCollectedDisplay) carrotsCollectedDisplay.textContent = collectedCarrotsCount;
        if (totalCarrotsDisplay) totalCarrotsDisplay.textContent = requiredCarrots;
    }

    // --- Drawing Logic ---
    function draw() { 
        // Draw Title/Game Over/Next Level screens
        if (!gameStarted || !currentLevelData) { 
             ctx.clearRect(0, 0, canvas.width, canvas.height); 
             ctx.fillStyle = '#87CEEB'; ctx.fillRect(0,0,canvas.width,canvas.height); 
             if (!isGameOver && startButton.textContent === "התחל משחק") {
                 messagesDiv.textContent = "הרפתקאות בובו הארנב";
             }
             // Keep existing message if game over or between levels
             startButton.style.display = 'block'; 
             return; 
        }

        // --- Draw Active Game Scene ---
        ctx.fillStyle = currentLevelData.bgColor || '#87CEEB'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Parallax Background
        const bgMountainX = -(cameraX * 0.1) % canvas.width; ctx.fillStyle = '#a0a0c0'; for (let i = -1; i < (canvas.width / 200) + 1; i++) { ctx.beginPath(); ctx.moveTo(bgMountainX + i * 200, INTERNAL_HEIGHT - 20); ctx.lineTo(bgMountainX + i * 200 + 100, INTERNAL_HEIGHT - 20 - 150); ctx.lineTo(bgMountainX + i * 200 + 200, INTERNAL_HEIGHT - 20); ctx.closePath(); ctx.fill(); }
        const bgHillsX = -(cameraX * 0.3) % canvas.width; ctx.fillStyle = '#6B8E63'; for (let i = -1; i < (canvas.width / 150) +1; i++) { ctx.beginPath(); ctx.arc(bgHillsX + i * 150 + 75, INTERNAL_HEIGHT - 20, 75, Math.PI, 2*Math.PI, false); ctx.fill(); }
        
        ctx.save(); ctx.translate(-cameraX, 0); // Apply Camera
        
        // Draw Game Objects (Platforms, Carrots, Enemies, Exit, Player)
        if (platforms) platforms.forEach(platform => { ctx.fillStyle = platform.color || currentLevelData.platformColor || '#6f4e37'; ctx.fillRect(platform.worldX, platform.y, platform.width, platform.height); ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(platform.worldX + 3, platform.y + platform.height -3, platform.width -6, 3); });
        if (carrots) carrots.forEach(carrot => { if (!carrot.collected) { ctx.fillStyle = carrot.color; ctx.fillRect(carrot.worldX, carrot.y, carrot.width, carrot.height); ctx.fillStyle = '#228B22'; ctx.beginPath(); ctx.moveTo(carrot.worldX + carrot.width / 2, carrot.y - 5); ctx.lineTo(carrot.worldX, carrot.y); ctx.lineTo(carrot.worldX + carrot.width, carrot.y); ctx.closePath(); ctx.fill(); } });
        if (enemies) enemies.forEach(enemy => { ctx.fillStyle = enemy.color; ctx.fillRect(enemy.worldX, enemy.y, enemy.width, enemy.height); if (!enemy.isBoss) { ctx.fillStyle = 'white'; const eyeXOffset = enemy.direction > 0 ? enemy.width * 0.6 : enemy.width * 0.2; ctx.fillRect(enemy.worldX + eyeXOffset, enemy.y + 5, 5, 5); ctx.fillRect(enemy.worldX + eyeXOffset + (enemy.direction > 0 ? 7 : -7) , enemy.y + 5, 5, 5); ctx.fillStyle = 'black'; ctx.fillRect(enemy.worldX + eyeXOffset + 1, enemy.y + 7, 2, 2); ctx.fillRect(enemy.worldX + eyeXOffset + (enemy.direction > 0 ? 7 : -7) + 1, enemy.y + 7, 2, 2); } else { ctx.fillStyle = 'yellow'; ctx.fillRect(enemy.worldX + enemy.width * 0.25, enemy.y + enemy.height * 0.2, 15, 15); ctx.fillRect(enemy.worldX + enemy.width * 0.75 - 15, enemy.y + enemy.height * 0.2, 15, 15); ctx.fillStyle = 'black'; ctx.fillRect(enemy.worldX + enemy.width * 0.25 + 5, enemy.y + enemy.height * 0.2 + 5, 5, 5); ctx.fillRect(enemy.worldX + enemy.width * 0.75 - 10, enemy.y + enemy.height * 0.2 + 5, 5, 5); } });
        if (exit) { ctx.fillStyle = exit.color; ctx.fillRect(exit.worldX, exit.y, exit.width, exit.height); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(exit.worldX + exit.width * 0.2, exit.y + exit.height * 0.2, exit.width*0.6, exit.height*0.8); if (exit.isOpen) { ctx.fillStyle = 'black'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.fillText("יציאה", exit.worldX + exit.width / 2, exit.y + exit.height / 2 + 5); } }
        if (player) { if (isInvincible) ctx.globalAlpha = (Math.floor(Date.now() / 100) % 2 === 0) ? 0.4 : 0.8; const playerDrawX = player.worldX; let playerVisualY = player.y; if (player.isCrouching) playerVisualY = player.y + (player.height - player.drawHeight); ctx.fillStyle = player.color; ctx.fillRect(playerDrawX, playerVisualY, player.drawWidth, player.drawHeight); const earHeight = 12, earWidth = 7; ctx.fillStyle = player.isCrouching ? player.color : '#ffc0cb'; ctx.fillRect(playerDrawX + player.drawWidth*0.2 - earWidth/2, playerVisualY - earHeight + (player.isCrouching?5:0), earWidth, earHeight); ctx.fillRect(playerDrawX + player.drawWidth*0.8 - earWidth/2, playerVisualY - earHeight + (player.isCrouching?5:0), earWidth, earHeight); ctx.globalAlpha = 1.0; }
        
        ctx.restore(); // Remove camera translation
    }

    // --- Main Game Loop ---
    function gameLoop() {
        if (!isGameOver && gameStarted) { updatePlayer(); updateCamera(); updateEnemies(); updatePlatforms(); checkCollisions(); }
        draw();
        // Continue loop if game active OR on a screen where interaction is possible (start button visible)
        if (gameStarted || startButton.style.display === 'block') {
            gameLoopId = requestAnimationFrame(gameLoop);
        } else {
            gameLoopId = null; // Ensure loop stops if game ends and button is hidden
        }
    }

    // --- Initialization and Resize ---

    // Start Button Event Listener
    startButton.addEventListener('click', async () => { 
        if (!soundsInitialized) await initializeSounds();
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
        if (isGameOver || currentLevelIndex >= allLevelsData.length) startGame(true);
        else startGame(false);
    });

    /** Resizes the canvas display element to fit its container while maintaining aspect ratio. */
    function resizeCanvas() {
        const container = gameContainer; 
        if (!container) return; // Exit if container not found

        const containerWidth = container.clientWidth;
        // Calculate available height more reliably, considering sibling elements
        const gameArea = document.getElementById('gameArea');
        let availableHeight = window.innerHeight - 40; // Start with viewport height minus some padding/margin
        if (gameArea) {
             availableHeight = gameArea.clientHeight - (messagesDiv.offsetHeight + startButton.offsetHeight + 30); // Subtract space for messages/button + margin
        }
        availableHeight = Math.max(100, availableHeight); // Ensure minimum height


        let newWidth, newHeight;

        // Calculate the best fit based on aspect ratio within available space
        if (containerWidth / availableHeight > ASPECT_RATIO) {
            // Available space is wider than game aspect ratio -> height is the limiting factor
            newHeight = availableHeight;
            newWidth = newHeight * ASPECT_RATIO;
        } else {
            // Available space is taller than game aspect ratio -> width is the limiting factor
            newWidth = containerWidth;
            newHeight = newWidth / ASPECT_RATIO;
        }
        
        // Ensure minimum size (optional, but good for usability)
        newWidth = Math.max(150, newWidth); 
        newHeight = Math.max(75, newHeight); 


        // Apply the calculated size to the canvas *style*
        canvas.style.width = `${newWidth}px`;
        canvas.style.height = `${newHeight}px`;
        
        // Adjust container height to match canvas height for better layout
        container.style.height = `${newHeight}px`; 

        // Redraw immediately after resize if game isn't actively looping but is visible
        if (!gameLoopId && (gameStarted || isGameOver || startButton.style.display === 'block')) {
             requestAnimationFrame(draw); // Use rAF for smoother redraw after resize
        }
    }

    // Initial resize and add listeners for window resize/orientation change
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', resizeCanvas);
    // Delay initial resize slightly to allow layout to settle
    setTimeout(resizeCanvas, 100); 

    // Initial Screen Setup
    messagesDiv.textContent = "הרפתקאות בובו הארנב";
    startButton.textContent = "התחל משחק";
    startButton.style.display = 'block';
    draw(); // Draw the initial title screen

}); // End DOMContentLoaded
