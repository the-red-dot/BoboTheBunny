/**
 * Bobo's Adventure Game
 * * A multi-level 2D platformer with scrolling, progressive difficulty,
 * sound effects, and basic responsive design with touch controls.
 */
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const messagesDiv = document.getElementById('messages');
    const startButton = document.getElementById('startButton');
    const heartsDisplay = document.getElementById('hearts');
    const carrotsCollectedDisplay = document.getElementById('carrotsCollected');
    const totalCarrotsDisplay = document.getElementById('totalCarrotsInLevel');
    const touchLeft = document.getElementById('touchLeft');
    const touchRight = document.getElementById('touchRight');
    const touchJump = document.getElementById('touchJump');
    const touchCrouch = document.getElementById('touchCrouch');
    const touchControlsDiv = document.getElementById('touchControls');

    // --- Game Constants ---
    const INTERNAL_WIDTH = 800;  // Fixed internal resolution width
    const INTERNAL_HEIGHT = 400; // Fixed internal resolution height
    canvas.width = INTERNAL_WIDTH; // Set internal canvas size
    canvas.height = INTERNAL_HEIGHT;

    const GRAVITY = 0.6;
    const PLAYER_SPEED = 3.5;
    const PLAYER_RUN_SPEED = 6;
    const JUMP_FORCE = 13;
    const MIN_JUMP_HEIGHT = 5;
    const INVINCIBILITY_DURATION = 2000; // ms
    const DOUBLE_TAP_THRESHOLD = 220; // ms
    const MAX_LIVES = 5;

    // --- Game State Variables ---
    let cameraX = 0;
    let player = null; // Player object, initialized in loadLevel
    let platforms = [];
    let carrots = [];
    let enemies = [];
    let exit = null;
    let keys = {}; // Tracks currently pressed keys/touch buttons
    let lives = 3;
    let requiredCarrots = 0;
    let collectedCarrotsCount = 0;
    let isGameOver = false;
    let gameStarted = false;
    let isInvincible = false;
    let invincibilityTimer = 0;
    let currentSpeed = PLAYER_SPEED;
    let lastKeyPressTime = { 'ArrowLeft': 0, 'ArrowRight': 0 };
    let gameLoopId = null; // Stores the requestAnimationFrame ID
    let soundsInitialized = false;
    let currentLevelIndex = 0;
    let currentLevelData = null; // Holds data for the current level

    // --- Sound Effects Setup (Tone.js) ---
    // Defines various synths for different game sounds.
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
            // Ensure Tone.js audio context is running (required after user interaction)
            if (Tone.context.state !== 'running') {
                Tone.context.resume();
            }
            // Trigger the specific sound based on its name
            if (soundName === 'jump') sounds.jump.triggerAttackRelease('C5', '8n');
            else if (soundName === 'collect') sounds.collect.triggerAttackRelease('E6', '16n', Tone.now(), 0.8);
            else if (soundName === 'hit') sounds.hit.triggerAttackRelease('0.1');
            else if (soundName === 'stomp') sounds.stomp.triggerAttackRelease('G3', '8n');
            else if (soundName === 'levelComplete') sounds.levelComplete.triggerAttackRelease(['C4', 'E4', 'G4', 'C5'], '0.5n');
            else if (soundName === 'gameOver') sounds.gameOver.triggerAttackRelease('C3', '1n');
            else if (soundName === 'nextLevel') sounds.nextLevel.triggerAttackRelease('A4', '4n');
            else if (soundName === 'gameWin') sounds.gameWin.triggerAttackRelease(['C4', 'G4', 'C5', 'E5', 'G5'], '1n');
        } catch (error) {
            console.error("Error playing sound:", soundName, error);
        }
    }

    /**
     * Initializes the Tone.js audio context. Must be called after user interaction.
     */
    async function initializeSounds() {
        if (soundsInitialized) return;
        try {
            await Tone.start(); // Start the audio context
            soundsInitialized = true;
            console.log("Audio context started by Tone.js");
        } catch (e) {
            console.error("Could not start Tone.js audio context:", e);
            // Optionally inform the user that sound might not work
        }
    }

    // --- Level Generation Helpers ---

    /**
     * Generates an array of platform objects for a level.
     * Uses INTERNAL_HEIGHT for y-position calculations.
     */
    function generatePlatforms(levelWidth, yOffset, count, minWidth, maxWidth, minGap, maxGap, canBeMoving = false, movingChance = 0.2) {
        const plats = [];
        let currentX = 150; // Start generating platforms after the initial player area
        for (let i = 0; i < count; i++) {
            if (currentX > levelWidth - maxWidth - 50) break; // Avoid placing too close to the end
            const width = Math.random() * (maxWidth - minWidth) + minWidth;
            const yPos = INTERNAL_HEIGHT - (Math.random() * 100 + yOffset); // Position relative to internal height
            
            let platform = { worldX: currentX, y: yPos, width: width, height: 20, color: '#6f4e37' }; // Default color

            // Randomly make some platforms moving
            if (canBeMoving && Math.random() < movingChance) {
                platform.type = 'moving';
                platform.speed = 0.5 + Math.random() * 1;
                platform.range = 30 + Math.random() * 50;
                platform.dir = Math.random() < 0.5 ? 1 : -1;
                platform.originalWorldX = currentX; // Store starting position for patrol
            }
            plats.push(platform);
            // Calculate position for the next platform
            currentX += width + (Math.random() * (maxGap - minGap) + minGap);
        }
        return plats;
    }
    
    /**
     * Generates carrot objects placed slightly above given platforms.
     */
    function generateCarrots(platforms, chance = 0.5) {
        const crts = [];
        platforms.forEach(p => {
            // Place carrots randomly on wider platforms
            if (Math.random() < chance && p.width > 30) {
                 crts.push({ 
                     worldX: p.worldX + p.width / 2 - 7.5, // Center the carrot
                     y: p.y - 28, // Position above the platform
                     width: 15, 
                     height: 25, 
                     color: '#fd7e14', 
                     collected: false 
                 });
            }
        });
        return crts;
    }

    /**
     * Generates enemy objects patrolling a specified range.
     * Uses INTERNAL_HEIGHT for y-position calculations.
     */
    function generateEnemies(levelWidth, count, yLevel, baseSpeed, patrolRangeWidth) {
        const enms = [];
        for (let i = 0; i < count; i++) {
            // Calculate a random starting position within the level bounds
            const startX = 200 + Math.random() * (levelWidth - patrolRangeWidth - 300);
            const patrolStart = Math.max(0, startX - patrolRangeWidth / 2); // Ensure patrol doesn't go below 0
            const patrolEnd = Math.min(levelWidth, startX + patrolRangeWidth / 2); // Ensure patrol doesn't exceed level width
            
            enms.push({
                worldX: startX, 
                y: INTERNAL_HEIGHT - yLevel, // Position relative to internal height
                width: 40, height: 30, color: '#dc3545',
                speed: baseSpeed + Math.random() * 0.5, // Randomize speed slightly
                originalSpeed: baseSpeed + Math.random() * 0.5, // Store base speed
                direction: Math.random() < 0.5 ? 1 : -1, // Random initial direction
                patrolRange: { start: patrolStart, end: patrolEnd } // Define patrol area
            });
        }
        return enms;
    }

    // --- Level Data Definition ---
    // Array containing configuration objects for each level.
    const allLevelsData = [
        // Level 1: Spring Forest (Tutorial)
        {
            width: 3200, bgColor: '#87CEEB', groundColor: '#28a745', platformColor: '#6f4e37',
            platforms: [
                { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 400, height: 20 }, { worldX: 500, y: INTERNAL_HEIGHT - 20, width: 600, height: 20 },
                { worldX: 1200, y: INTERNAL_HEIGHT - 20, width: 800, height: 20 }, { worldX: 2100, y: INTERNAL_HEIGHT - 20, width: 3200 - 2100, height: 20 },
                { worldX: 150, y: INTERNAL_HEIGHT - 80, width: 100, height: 20 }, { worldX: 300, y: INTERNAL_HEIGHT - 140, width: 120, height: 20 },
                { worldX: 550, y: INTERNAL_HEIGHT - 100, width: 150, height: 20 }, { worldX: 700, y: INTERNAL_HEIGHT - 180, width: 80, height: 20 },
                { worldX: 850, y: INTERNAL_HEIGHT - 120, width: 100, height: 20 }, { worldX: 1000, y: INTERNAL_HEIGHT - 90, width: 130, height: 20 },
                { worldX: 1150, y: INTERNAL_HEIGHT - 150, width: 100, height: 20 }, { worldX: 1300, y: INTERNAL_HEIGHT - 200, width: 120, height: 20 },
                { worldX: 1500, y: INTERNAL_HEIGHT - 100, width: 150, height: 20 }, 
                { worldX: 1600, y: INTERNAL_HEIGHT - 160, width: 70, height: 20, type: 'moving', speed: 1, range: 50, dir: 1, originalWorldX: 1600 },
                { worldX: 1750, y: INTERNAL_HEIGHT - 130, width: 100, height: 20 }, { worldX: 1900, y: INTERNAL_HEIGHT - 70, width: 90, height: 20 },
                { worldX: 2050, y: INTERNAL_HEIGHT - 140, width: 110, height: 20 }, { worldX: 2200, y: INTERNAL_HEIGHT - 190, width: 100, height: 20 },
                { worldX: 2350, y: INTERNAL_HEIGHT - 100, width: 150, height: 20 }, { worldX: 2500, y: INTERNAL_HEIGHT - 150, width: 80, height: 20 },
                { worldX: 2650, y: INTERNAL_HEIGHT - 220, width: 120, height: 20 }, { worldX: 2800, y: INTERNAL_HEIGHT - 120, width: 100, height: 20 },
                { worldX: 2950, y: INTERNAL_HEIGHT - 170, width: 130, height: 20, type: 'moving', speed: 1.5, range: 70, dir: 1, originalWorldX: 2950 },
            ],
            carrots: [ // Fewer carrots for level 1
                { worldX: 180, y: INTERNAL_HEIGHT - 105, width: 15, height: 25, color: '#fd7e14', collected: false },
                { worldX: 350, y: INTERNAL_HEIGHT - 165, width: 15, height: 25, color: '#fd7e14', collected: false },
                { worldX: 1350, y: INTERNAL_HEIGHT - 225, width: 15, height: 25, color: '#fd7e14', collected: false },
                { worldX: 2250, y: INTERNAL_HEIGHT - 215, width: 15, height: 25, color: '#fd7e14', collected: false },
                { worldX: 3000, y: INTERNAL_HEIGHT - 50, width: 15, height: 25, color: '#fd7e14', collected: false },
            ],
            enemies: [
                { worldX: 400, y: INTERNAL_HEIGHT - 50, width: 40, height: 30, color: '#dc3545', speed: 1, originalSpeed: 1, direction: 1, patrolRange: { start: 300, end: 500 }},
                { worldX: 900, y: INTERNAL_HEIGHT - 50, width: 40, height: 30, color: '#dc3545', speed: 1.2, originalSpeed: 1.2, direction: 1, patrolRange: { start: 800, end: 1050 }},
            ],
            exitY: INTERNAL_HEIGHT - 60, requiredCarrotsFraction: 0.6 
        },
        // Level 2: Cave Theme
        { 
            width: 3500, bgColor: '#34495e', groundColor: '#555', platformColor: '#4a4a4a', 
            platforms: [ { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 300, height: 20 }, { worldX: 400, y: INTERNAL_HEIGHT - 20, width: 500, height: 20 }, { worldX: 1000, y: INTERNAL_HEIGHT - 20, width: 700, height: 20 }, { worldX: 1800, y: INTERNAL_HEIGHT - 20, width: 3500 - 1800, height: 20 }, ...generatePlatforms(3500, 70, 12, 60, 100, 80, 150, true, 0.3) ], 
            carrots: [], enemies: generateEnemies(3500, 4, 50, 1.3, 200), 
            exitY: INTERNAL_HEIGHT - 70, requiredCarrotsFraction: 0.7 
        },
        // Level 3: Winter Theme
        { 
            width: 4000, bgColor: '#e0f7fa', groundColor: '#c0c0c0', platformColor: '#add8e6', 
            platforms: [ { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 200, height: 20 }, { worldX: 300, y: INTERNAL_HEIGHT - 20, width: 400, height: 20 }, { worldX: 800, y: INTERNAL_HEIGHT - 20, width: 600, height: 20 }, { worldX: 1500, y: INTERNAL_HEIGHT - 20, width: 4000 - 1500, height: 20 }, ...generatePlatforms(4000, 60, 15, 50, 90, 100, 180, true, 0.4) ], 
            carrots: [], enemies: generateEnemies(4000, 5, 50, 1.5, 180), 
            exitY: INTERNAL_HEIGHT - 60, requiredCarrotsFraction: 0.75 
        },
        // Level 4: Forest at Dusk
        { 
            width: 3800, bgColor: '#4a4e69', groundColor: '#22333b', platformColor: '#5e503f', 
            platforms: [ { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 350, height: 20 }, { worldX: 450, y: INTERNAL_HEIGHT - 20, width: 550, height: 20 }, { worldX: 1100, y: INTERNAL_HEIGHT - 20, width: 750, height: 20 }, { worldX: 1950, y: INTERNAL_HEIGHT - 20, width: 3800 - 1950, height: 20 }, ...generatePlatforms(3800, 80, 14, 70, 110, 90, 160, true, 0.35) ], 
            carrots: [], enemies: generateEnemies(3800, 6, 50, 1.4, 220), 
            exitY: INTERNAL_HEIGHT - 65, requiredCarrotsFraction: 0.7 
        },
        // Level 5: High Mountains
        { 
            width: 4200, bgColor: '#9db4c0', groundColor: '#778899', platformColor: '#5c6b73', 
            platforms: [ { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 150, height: 20 }, { worldX: 500, y: INTERNAL_HEIGHT - 20, width: 200, height: 20 }, { worldX: 1200, y: INTERNAL_HEIGHT - 20, width: 180, height: 20 }, { worldX: 2000, y: INTERNAL_HEIGHT - 20, width: 250, height: 20 }, { worldX: 3800, y: INTERNAL_HEIGHT - 20, width: 4200 - 3800, height: 20 }, ...generatePlatforms(4200, 50, 18, 40, 80, 120, 200, true, 0.5) ], 
            carrots: [], enemies: generateEnemies(4200, 7, 50, 1.6, 150), 
            exitY: INTERNAL_HEIGHT - 80, requiredCarrotsFraction: 0.8 
        },
    ];
    // Auto-generate levels 6-10 based on level 5 parameters
    for (let i = 1; i <= 5; i++) {
        const prevLevel = allLevelsData[4]; const newLevelWidth = prevLevel.width + i * 200;
        const newBgColor = `hsl(${200 + i * 10}, 50%, ${60 - i * 2}%)`; const newGroundColor = `hsl(${120 + i * 5}, 30%, ${40 - i * 2}%)`;
        const newPlatformColor = `hsl(${30 + i * 5}, 30%, ${35 - i * 2}%)`;
        allLevelsData.push({ 
            width: newLevelWidth, bgColor: newBgColor, groundColor: newGroundColor, platformColor: newPlatformColor, 
            platforms: [ { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 100 + i*10, height: 20 }, { worldX: newLevelWidth - (100 + i*10), y: INTERNAL_HEIGHT - 20, width: 100 + i*10, height: 20 }, ...generatePlatforms(newLevelWidth, 40 + i*5, 18 + i, 35 - i*2, 75 - i*3, 130 + i*10, 220 + i*10, true, 0.5 + i*0.05) ], 
            carrots: [], enemies: generateEnemies(newLevelWidth, 7 + i, 50, 1.6 + i * 0.1, 140 - i*5), 
            exitY: INTERNAL_HEIGHT - (80 + i*5), requiredCarrotsFraction: Math.min(0.95, 0.8 + i * 0.03) 
        });
    }
    // Level 11: Boss Placeholder
    allLevelsData.push({ 
        width: 1000, bgColor: '#200000', groundColor: '#100000', platformColor: '#301010', 
        platforms: [ { worldX: 0, y: INTERNAL_HEIGHT - 20, width: 1000, height: 20 } ], carrots: [], 
        enemies: [ { worldX: 450, y: INTERNAL_HEIGHT - 100, width: 100, height: 80, color: '#ff0000', speed: 0, originalSpeed: 0, direction: 1, patrolRange: {start: 450, end: 450}, isBoss: true } ], 
        exitY: INTERNAL_HEIGHT - 100, requiredCarrotsFraction: 0, isBossLevel: true 
    });

    /**
     * Loads the specified level data into the game state.
     * @param {number} levelIndex - The index of the level to load from allLevelsData.
     */
    function loadLevel(levelIndex) {
        if (levelIndex >= allLevelsData.length) {
            winGame(); // All levels completed
            return;
        }
        // Deep copy level data to prevent modifications affecting the original definition
        currentLevelData = JSON.parse(JSON.stringify(allLevelsData[levelIndex])); 

        // --- Initialize Level Elements ---
        // Assign default colors and properties if not specified
        currentLevelData.platforms.forEach(p => {
            if (!p.color) p.color = (p.y === INTERNAL_HEIGHT - 20) ? currentLevelData.groundColor : currentLevelData.platformColor;
            if (p.type === 'moving' && p.originalWorldX === undefined) p.originalWorldX = p.worldX;
        });
        
        // Generate carrots procedurally if none are defined for the level
        if (currentLevelData.carrots.length === 0 && !currentLevelData.isBossLevel) {
            currentLevelData.carrots = generateCarrots(currentLevelData.platforms.filter(p => p.y < INTERNAL_HEIGHT - 20), 0.6);
        }
        currentLevelData.carrots.forEach(c => c.collected = false); // Ensure carrots start uncollected

        platforms = currentLevelData.platforms;
        carrots = currentLevelData.carrots;
        enemies = currentLevelData.enemies;
        
        // Calculate required carrots based on fraction, unless it's a boss level
        requiredCarrots = currentLevelData.isBossLevel ? 0 : Math.ceil(carrots.length * currentLevelData.requiredCarrotsFraction);

        // Define the exit object for the level
        exit = {
            worldX: currentLevelData.width - 100, // Position near the end
            y: currentLevelData.exitY || INTERNAL_HEIGHT - 60, // Use level-specific Y or default
            width: 50, height: 50, color: '#6c757d', isOpen: false
        };

        // --- Reset Player State for New Level ---
        player = {
            worldX: 100, y: INTERNAL_HEIGHT - 100, // Start position
            width: 30, height: 40, drawWidth: 30, drawHeight: 40, color: '#007bff',
            velocityX: 0, velocityY: 0, isJumping: false, isOnGround: false,
            isCrouching: false, canVariableJump: false, jumpButtonPressedTime: 0
        };
        collectedCarrotsCount = 0;
        cameraX = 0; // Reset camera scroll
        currentSpeed = PLAYER_SPEED;
        isGameOver = false; // Ensure game is playable
        gameStarted = true; // Allow game loop to run updates

        updateHUD(); // Update displayed info (lives, carrots)
        messagesDiv.textContent = `שלב ${levelIndex + 1}`; // Display current level number
        // Clear level message after a short delay
        setTimeout(() => { if (messagesDiv.textContent === `שלב ${levelIndex + 1}`) messagesDiv.textContent = ""; }, 1500);
    }

    /**
     * Starts or restarts the game.
     * @param {boolean} startFreshGame - If true, resets level index and lives.
     */
    function startGame(startFreshGame = false) {
        if (startFreshGame) {
            currentLevelIndex = 0; // Go back to level 1
            lives = 3; // Reset lives
        }
        isGameOver = false;
        gameStarted = true;
        startButton.style.display = 'none'; // Hide start button
        messagesDiv.textContent = ''; // Clear messages
        
        loadLevel(currentLevelIndex); // Load the appropriate level

        // Start the game loop if it's not already running
        if (!gameLoopId) {
            gameLoop();
        }
    }

    // --- Input Handling ---

    // Keyboard Input
    document.addEventListener('keydown', (e) => {
        // Quick Restart Feature (Press 'R') - Useful for testing
        if (e.key === 'r' || e.key === 'R') { 
            if (gameStarted || isGameOver) {
                 if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
                 startGame(true); // Full restart
            }
            return; // Prevent other keydown actions if restarting
        }

        keys[e.key] = true; // Mark key as pressed
        if (isGameOver || !gameStarted || !player) return; // Ignore input if game not active

        // Running (Double Tap or Shift) - Keyboard only for now
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const now = Date.now();
            if (now - lastKeyPressTime[e.key] < DOUBLE_TAP_THRESHOLD) currentSpeed = PLAYER_RUN_SPEED;
            else currentSpeed = PLAYER_SPEED;
            lastKeyPressTime[e.key] = now;
        }
        // Jumping
        if ((e.key === 'ArrowUp' || e.key === ' ') && player.isOnGround && !player.isJumping) {
            player.isJumping = true; player.isOnGround = false; player.velocityY = -JUMP_FORCE;
            player.canVariableJump = true; player.jumpButtonPressedTime = Date.now(); playSound('jump');
        }
        // Crouching
        if (e.key === 'ArrowDown' && !player.isCrouching && player.isOnGround) {
            player.isCrouching = true; player.drawHeight = 25; player.drawWidth = 35;
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key] = false; // Mark key as released
        if (isGameOver || !gameStarted || !player) return;

        // Stop running if movement keys released
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (!keys['ArrowLeft'] && !keys['ArrowRight']) currentSpeed = PLAYER_SPEED;
        }
        // Variable jump height based on key release timing
        if ((e.key === 'ArrowUp' || e.key === ' ') && player.canVariableJump) {
            player.canVariableJump = false;
            if (player.velocityY < -MIN_JUMP_HEIGHT) {
                 const pressDuration = Date.now() - player.jumpButtonPressedTime;
                 if (pressDuration < 150) player.velocityY = -MIN_JUMP_HEIGHT * 1.5; 
            }
        }
        // Stop crouching
        if (e.key === 'ArrowDown' && player.isCrouching) {
            player.isCrouching = false; player.drawHeight = player.height; player.drawWidth = player.width;
        }
    });

    // Touch Input
    /**
     * Handles the start of a touch event on a control button.
     * @param {Event} e - The touch event.
     * @param {string} key - The keyboard key to simulate ('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown').
     */
    function handleTouchStart(e, key) {
        e.preventDefault(); // Prevent default browser actions (scrolling, zooming)
        keys[key] = true; // Simulate key press

        // Trigger immediate actions like jump/crouch
        if (key === 'ArrowUp' && player && player.isOnGround && !player.isJumping) {
            player.isJumping = true; player.isOnGround = false; player.velocityY = -JUMP_FORCE;
            player.canVariableJump = true; player.jumpButtonPressedTime = Date.now(); playSound('jump');
        } else if (key === 'ArrowDown' && player && !player.isCrouching && player.isOnGround) {
            player.isCrouching = true; player.drawHeight = 25; player.drawWidth = 35;
        }
        // Simplified run for touch: always run when moving
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
             currentSpeed = PLAYER_RUN_SPEED; 
        }
    }
    /**
     * Handles the end of a touch event on a control button.
     * @param {Event} e - The touch event.
     * @param {string} key - The keyboard key to simulate.
     */
    function handleTouchEnd(e, key) {
        e.preventDefault();
        keys[key] = false; // Simulate key release

        // Handle key release actions (stop crouching, variable jump end)
        if (key === 'ArrowDown' && player && player.isCrouching) {
            player.isCrouching = false; player.drawHeight = player.height; player.drawWidth = player.width;
        } else if (key === 'ArrowUp' && player && player.canVariableJump) {
             player.canVariableJump = false; 
            // Adjust jump height if touch ended quickly (similar to keyup)
            if (player.velocityY < -MIN_JUMP_HEIGHT) {
                 const pressDuration = Date.now() - player.jumpButtonPressedTime; 
                 if (pressDuration < 150) player.velocityY = -MIN_JUMP_HEIGHT * 1.5; 
            }
        }
        // Stop running if both left/right are released
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
            if (!keys['ArrowLeft'] && !keys['ArrowRight']) currentSpeed = PLAYER_SPEED;
        }
    }

    // Add touch listeners if the buttons exist in the HTML
    if (touchLeft) {
        touchLeft.addEventListener('touchstart', (e) => handleTouchStart(e, 'ArrowLeft'), { passive: false });
        touchLeft.addEventListener('touchend', (e) => handleTouchEnd(e, 'ArrowLeft'), { passive: false });
    }
    if (touchRight) {
        touchRight.addEventListener('touchstart', (e) => handleTouchStart(e, 'ArrowRight'), { passive: false });
        touchRight.addEventListener('touchend', (e) => handleTouchEnd(e, 'ArrowRight'), { passive: false });
    }
    if (touchJump) {
        touchJump.addEventListener('touchstart', (e) => handleTouchStart(e, 'ArrowUp'), { passive: false }); // Simulates ArrowUp
        touchJump.addEventListener('touchend', (e) => handleTouchEnd(e, 'ArrowUp'), { passive: false });
    }
    if (touchCrouch) {
        touchCrouch.addEventListener('touchstart', (e) => handleTouchStart(e, 'ArrowDown'), { passive: false });
        touchCrouch.addEventListener('touchend', (e) => handleTouchEnd(e, 'ArrowDown'), { passive: false });
    }

    // --- Game Update Logic ---

    /** Updates the player's position, velocity, and state based on input and physics. */
    function updatePlayer() { 
        if (isGameOver || !player) return; // Don't update if game over or player doesn't exist

        // Horizontal Movement (only if not crouching)
        player.velocityX = 0;
        if (keys['ArrowLeft'] && !player.isCrouching) player.velocityX = -currentSpeed;
        if (keys['ArrowRight'] && !player.isCrouching) player.velocityX = currentSpeed;
        player.worldX += player.velocityX;

        // Vertical Movement (Gravity)
        player.velocityY += GRAVITY;
        player.y += player.velocityY;
        player.isOnGround = false; // Assume not on ground until collision check

        // World Boundary Collision (Horizontal)
        if (player.worldX < 0) player.worldX = 0;
        if (player.worldX + player.width > currentLevelData.width) player.worldX = currentLevelData.width - player.width;
        
        // Fall Death Check (Vertical - uses internal height)
        if (player.y + player.height > INTERNAL_HEIGHT + 50) { // Allow falling slightly off screen
            loseLife(true); // Pass true to indicate fall death
        }

        // Invincibility Timer
        if (isInvincible) { 
            invincibilityTimer -= 1000/60; // Decrease timer (approx 60fps)
            if (invincibilityTimer <= 0) isInvincible = false; // End invincibility
        }
    }

    /** Updates the camera position to follow the player smoothly. */
    function updateCamera() { 
        if (!player || !currentLevelData) return;
        // Target camera position to center the player (using display width)
        const targetCameraX = player.worldX - (canvas.clientWidth / 2 - player.width / 2); 
        // Smooth camera movement (lerp - linear interpolation)
        cameraX += (targetCameraX - cameraX) * 0.1; 
        // Clamp camera position to level boundaries (using display width)
        if (cameraX < 0) cameraX = 0;
        if (cameraX > currentLevelData.width - canvas.clientWidth) cameraX = currentLevelData.width - canvas.clientWidth; 
    }

    /** Updates the position of moving platforms. */
    function updatePlatforms() { 
        if (!platforms) return;
        platforms.forEach(p => {
            if (p.type === 'moving') {
                p.worldX += p.speed * p.dir; // Move platform
                // Check patrol boundaries and reverse direction
                 if (p.dir === 1 && p.worldX >= p.originalWorldX + p.range) { p.worldX = p.originalWorldX + p.range; p.dir = -1; }
                 else if (p.dir === -1 && p.worldX <= p.originalWorldX) { p.worldX = p.originalWorldX; p.dir = 1; }
            }
        });
    }

    /** Updates enemy positions and applies progressive difficulty. */
    function updateEnemies() { 
        if (isGameOver || !enemies || !currentLevelData) return;
        enemies.forEach(enemy => {
            if (enemy.isBoss) return; // Skip basic movement for boss
            // Increase speed based on camera progress and current level index
            const progressFactor = Math.min(1.5, 1 + (cameraX / currentLevelData.width) * 0.5);
            enemy.speed = enemy.originalSpeed * progressFactor * (1 + currentLevelIndex * 0.05); 
            enemy.worldX += enemy.speed * enemy.direction; // Move enemy
            // Check patrol boundaries and reverse direction
            if (enemy.worldX <= enemy.patrolRange.start || enemy.worldX + enemy.width >= enemy.patrolRange.end) enemy.direction *= -1;
        });
    }

    /** Returns the player's current hitbox based on whether they are crouching. */
    function getPlayerHitbox() { 
        if (!player) return {x:0,y:0,width:0,height:0}; // Safety check
        if (player.isCrouching) return { x: player.worldX, y: player.y + (player.height - player.drawHeight), width: player.drawWidth, height: player.drawHeight };
        return { x: player.worldX, y: player.y, width: player.width, height: player.height };
    }

    /** Checks for collisions between the player and other game objects. */
    function checkCollisions() { 
        if (isGameOver || !player || !platforms || !carrots || !enemies || !exit) return;
        const playerHitbox = getPlayerHitbox();
        let onAnyPlatform = false; // Flag to track if player landed on any platform this frame

        // Player vs Platforms Collision
        platforms.forEach(platform => {
            const platformHitbox = { x: platform.worldX, y: platform.y, width: platform.width, height: platform.height };
            if (isRectColliding(playerHitbox, platformHitbox)) {
                const prevPlayerBottom = (player.y + playerHitbox.height) - player.velocityY; // Player bottom edge in previous frame
                // Collision from Top (Landing)
                if (player.velocityY >= 0 && prevPlayerBottom <= platform.y + 1) {
                    player.y = platform.y - playerHitbox.height; // Place player on top
                    player.velocityY = 0; player.isJumping = false; player.isOnGround = true; onAnyPlatform = true;
                    // Stick player to moving platforms
                    if (platform.type === 'moving' && player.isOnGround) player.worldX += platform.speed * platform.dir;
                } 
                // Collision from Bottom (Hitting Head)
                else if (player.velocityY < 0 && player.y - player.velocityY >= platform.y + platform.height -1) {
                    player.y = platform.y + platform.height; player.velocityY = 0; // Stop upward movement
                } 
                // Collision from Sides
                else {
                     if (player.velocityX > 0 && playerHitbox.x + playerHitbox.width - player.velocityX <= platform.worldX) { player.worldX = platform.worldX - playerHitbox.width; player.velocityX = 0; } // Hit left side of platform
                     else if (player.velocityX < 0 && playerHitbox.x - player.velocityX >= platform.worldX + platform.width) { player.worldX = platform.worldX + platform.width; player.velocityX = 0; } // Hit right side of platform
                }
            }
        });

        // Player vs Carrots Collision
        carrots.forEach((carrot) => {
            if (!carrot.collected && isRectColliding(playerHitbox, {x: carrot.worldX, y: carrot.y, width: carrot.width, height: carrot.height})) {
                carrot.collected = true; collectedCarrotsCount++; playSound('collect'); updateHUD(); checkLevelCompletion();
            }
        });

        // Player vs Enemies Collision
        enemies.forEach(enemy => {
            const enemyHitbox = { x: enemy.worldX, y: enemy.y, width: enemy.width, height: enemy.height };
            if (isRectColliding(playerHitbox, enemyHitbox) && !isInvincible) {
                if (enemy.isBoss){ loseLife(); return; } // Simple boss collision = lose life
                const prevPlayerBottom = (player.y + playerHitbox.height) - player.velocityY;
                // Stomp Collision (Jumping on top)
                if (player.velocityY > 0 && prevPlayerBottom < enemy.y + 5 && !player.isCrouching) {
                    enemies.splice(enemies.indexOf(enemy), 1); // Remove enemy
                    player.velocityY = -JUMP_FORCE / 1.5; // Bounce
                    player.isJumping = true; player.isOnGround = false; playSound('stomp');
                } 
                // Side Collision
                else loseLife();
            }
        });

        // Player vs Exit Collision
        if (exit.isOpen && isRectColliding(playerHitbox, {x: exit.worldX, y: exit.y, width: exit.width, height: exit.height})) {
            levelComplete();
        }
    }

    /** Simple Axis-Aligned Bounding Box collision detection. */
    function isRectColliding(rect1, rect2) { 
        return rect1.x < rect2.x + rect2.width && rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height && rect1.y + rect1.height > rect2.y;
    }

    // --- Game State Management ---

    /** Handles player losing a life. */
    function loseLife(isFallDeath = false) { 
        if (isInvincible || isGameOver) return; // Can't lose life if already invincible or game over
        lives--; playSound('hit'); isInvincible = true; invincibilityTimer = INVINCIBILITY_DURATION; updateHUD();

        if (lives <= 0) {
            gameOver(); // No lives left
        } else {
            // Respawn player (position depends on death type)
            if (isFallDeath) { player.worldX = Math.max(50, cameraX + 100); player.y = INTERNAL_HEIGHT - 200; } // Respawn higher after fall
            else { player.worldX = Math.max(50, player.worldX - 50); player.y = INTERNAL_HEIGHT - 100; } // Respawn slightly back after hit
            player.velocityX = 0; player.velocityY = 0; player.isCrouching = false; player.drawHeight = player.height; player.drawWidth = player.width;
            // Display temporary message
            messagesDiv.textContent = "נפסלת! נסה שוב."; setTimeout(() => { if(!isGameOver && messagesDiv.textContent === "נפסלת! נסה שוב.") messagesDiv.textContent = ""; }, 2000);
        }
    }

    /** Handles the game over state. */
    function gameOver() { 
        isGameOver = true; gameStarted = false; playSound('gameOver');
        messagesDiv.innerHTML = `אוי לא, נגמרו החיים! <br> הגעת לשלב ${currentLevelIndex + 1}`;
        startButton.textContent = "שחק שוב מההתחלה"; startButton.style.display = 'block';
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; } // Stop the game loop
    }

    /** Checks if enough carrots are collected to open the exit. */
    function checkLevelCompletion() { 
        if (collectedCarrotsCount >= requiredCarrots && !currentLevelData.isBossLevel) { // Don't open exit based on carrots for boss level
            exit.isOpen = true; exit.color = '#FFD700'; // Change exit color to gold
        }
        // Add boss defeat condition here later if needed
        if (currentLevelData.isBossLevel && enemies.length === 0) { // Example: Open exit if boss (only enemy) is defeated
             exit.isOpen = true; exit.color = '#FFD700';
        }
    }

    /** Handles completing the current level and advancing to the next. */
    function levelComplete() { 
        gameStarted = false; // Pause updates
        playSound('levelComplete'); 
        currentLevelIndex++; // Advance level index
        if (currentLevelIndex >= allLevelsData.length) {
            winGame(); // All levels finished
        } else {
            // Prepare for next level
            messagesDiv.textContent = `שלב ${currentLevelIndex} הושלם!`; // Display message (level index is 0-based, so show previous completed level)
            startButton.textContent = `התחל שלב ${currentLevelIndex + 1}`; // Update button text
            startButton.style.display = 'block'; // Show button
            playSound('nextLevel');
        }
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; } // Stop current loop
    }

    /** Handles the game win state. */
    function winGame() { 
        isGameOver = true; gameStarted = false; playSound('gameWin');
        messagesDiv.innerHTML = `כל הכבוד! ניצחת את המשחק! <br> סיימת את כל ${allLevelsData.length} השלבים!`;
        startButton.textContent = "שחק שוב מההתחלה"; startButton.style.display = 'block';
        currentLevelIndex = 0; // Reset for potential replay
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
    }

    /** Updates the Heads-Up Display (Lives, Carrots). */
    function updateHUD() { 
        if (heartsDisplay) heartsDisplay.textContent = lives;
        if (carrotsCollectedDisplay) carrotsCollectedDisplay.textContent = collectedCarrotsCount;
        if (totalCarrotsDisplay) totalCarrotsDisplay.textContent = requiredCarrots;
    }

    // --- Drawing Logic ---

    /** Main drawing function, called every frame. */
    function draw() {
        // Handle drawing for different game states (pre-start, game over, between levels)
        if (!currentLevelData && !isGameOver) { // Before first level load or after win/gameover
             ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#87CEEB'; ctx.fillRect(0,0,canvas.width,canvas.height);
             if (!isGameOver) messagesDiv.textContent = "הרפתקאות בובו הארנב";
             startButton.style.display = 'block';
             if (startButton.textContent === "התחל משחק") messagesDiv.textContent = "הרפתקאות בובו הארנב";
             return;
        }
        if (isGameOver && !gameStarted) return; // Keep game over screen static
        if (!gameStarted && !isGameOver) { // Initial screen before first game start
            ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#87CEEB'; ctx.fillRect(0,0,canvas.width,canvas.height);
            messagesDiv.textContent = "הרפתקאות בובו הארנב";
            startButton.style.display = 'block'; startButton.textContent = "התחל משחק";
            return;
        }

        // --- Draw Active Game Scene ---
        // Clear canvas with level background color
        ctx.fillStyle = currentLevelData.bgColor || '#87CEEB'; 
        ctx.fillRect(0, 0, canvas.width, canvas.height); // Use internal width/height for clearing

        // Draw Parallax Background
        const bgMountainX = -(cameraX * 0.1) % canvas.width; ctx.fillStyle = '#a0a0c0';
        for (let i = -1; i < (canvas.width / 200) + 1; i++) { ctx.beginPath(); ctx.moveTo(bgMountainX + i * 200, INTERNAL_HEIGHT - 20); ctx.lineTo(bgMountainX + i * 200 + 100, INTERNAL_HEIGHT - 20 - 150); ctx.lineTo(bgMountainX + i * 200 + 200, INTERNAL_HEIGHT - 20); ctx.closePath(); ctx.fill(); }
        const bgHillsX = -(cameraX * 0.3) % canvas.width; ctx.fillStyle = '#6B8E63';
        for (let i = -1; i < (canvas.width / 150) +1; i++) { ctx.beginPath(); ctx.arc(bgHillsX + i * 150 + 75, INTERNAL_HEIGHT - 20, 75, Math.PI, 2*Math.PI, false); ctx.fill(); }

        // Apply camera translation
        ctx.save(); 
        ctx.translate(-cameraX, 0);

        // Draw Platforms
        if (platforms) platforms.forEach(platform => { 
            ctx.fillStyle = platform.color || currentLevelData.platformColor || '#6f4e37'; 
            ctx.fillRect(platform.worldX, platform.y, platform.width, platform.height); 
            // Simple 3D effect
            ctx.fillStyle = 'rgba(0,0,0,0.2)'; 
            ctx.fillRect(platform.worldX + 3, platform.y + platform.height -3, platform.width -6, 3); 
        });

        // Draw Carrots
        if (carrots) carrots.forEach(carrot => { 
            if (!carrot.collected) { 
                ctx.fillStyle = carrot.color; ctx.fillRect(carrot.worldX, carrot.y, carrot.width, carrot.height); 
                // Carrot top
                ctx.fillStyle = '#228B22'; ctx.beginPath(); 
                ctx.moveTo(carrot.worldX + carrot.width / 2, carrot.y - 5); 
                ctx.lineTo(carrot.worldX, carrot.y); ctx.lineTo(carrot.worldX + carrot.width, carrot.y); 
                ctx.closePath(); ctx.fill(); 
            } 
        });

        // Draw Enemies
        if (enemies) enemies.forEach(enemy => { 
            ctx.fillStyle = enemy.color; ctx.fillRect(enemy.worldX, enemy.y, enemy.width, enemy.height); 
            // Draw eyes (different for boss)
            if (!enemy.isBoss) { 
                ctx.fillStyle = 'white'; const eyeXOffset = enemy.direction > 0 ? enemy.width * 0.6 : enemy.width * 0.2; 
                ctx.fillRect(enemy.worldX + eyeXOffset, enemy.y + 5, 5, 5); ctx.fillRect(enemy.worldX + eyeXOffset + (enemy.direction > 0 ? 7 : -7) , enemy.y + 5, 5, 5); 
                ctx.fillStyle = 'black'; ctx.fillRect(enemy.worldX + eyeXOffset + 1, enemy.y + 7, 2, 2); ctx.fillRect(enemy.worldX + eyeXOffset + (enemy.direction > 0 ? 7 : -7) + 1, enemy.y + 7, 2, 2); 
            } else { // Boss eyes
                 ctx.fillStyle = 'yellow'; ctx.fillRect(enemy.worldX + enemy.width * 0.25, enemy.y + enemy.height * 0.2, 15, 15); ctx.fillRect(enemy.worldX + enemy.width * 0.75 - 15, enemy.y + enemy.height * 0.2, 15, 15); 
                 ctx.fillStyle = 'black'; ctx.fillRect(enemy.worldX + enemy.width * 0.25 + 5, enemy.y + enemy.height * 0.2 + 5, 5, 5); ctx.fillRect(enemy.worldX + enemy.width * 0.75 - 10, enemy.y + enemy.height * 0.2 + 5, 5, 5); 
            } 
        });

        // Draw Exit
        if (exit) { 
            ctx.fillStyle = exit.color; ctx.fillRect(exit.worldX, exit.y, exit.width, exit.height); 
            // Simple door visual
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(exit.worldX + exit.width * 0.2, exit.y + exit.height * 0.2, exit.width*0.6, exit.height*0.8); 
            if (exit.isOpen) { ctx.fillStyle = 'black'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.fillText("יציאה", exit.worldX + exit.width / 2, exit.y + exit.height / 2 + 5); } 
        }
        
        // Draw Player
        if (player) { 
            // Apply flashing effect if invincible
            if (isInvincible) ctx.globalAlpha = (Math.floor(Date.now() / 100) % 2 === 0) ? 0.4 : 0.8;
            const playerDrawX = player.worldX; // Use world coordinates
            let playerVisualY = player.y;
            if (player.isCrouching) playerVisualY = player.y + (player.height - player.drawHeight); // Adjust Y pos visually when crouching
            ctx.fillStyle = player.color;
            ctx.fillRect(playerDrawX, playerVisualY, player.drawWidth, player.drawHeight); // Use drawWidth/Height
            // Draw ears
            const earHeight = 12, earWidth = 7;
            ctx.fillStyle = player.isCrouching ? player.color : '#ffc0cb'; // Pink inner ear, or body color if crouched
            ctx.fillRect(playerDrawX + player.drawWidth*0.2 - earWidth/2, playerVisualY - earHeight + (player.isCrouching?5:0), earWidth, earHeight);
            ctx.fillRect(playerDrawX + player.drawWidth*0.8 - earWidth/2, playerVisualY - earHeight + (player.isCrouching?5:0), earWidth, earHeight);
            ctx.globalAlpha = 1.0; // Reset alpha after drawing player
        }

        // Restore context to remove camera translation
        ctx.restore(); 
    }

    // --- Main Game Loop ---
    /** The core game loop, updates and draws the game state repeatedly. */
    function gameLoop() {
        // Update game logic only if game is running
        if (!isGameOver && gameStarted) { 
            updatePlayer(); updateCamera(); updateEnemies(); updatePlatforms(); checkCollisions(); 
        }
        // Always draw the current state
        draw(); 
        // Request the next frame, but only if the game should continue looping
        if (gameStarted || startButton.style.display === 'block') { // Loop if game active or on a screen with the start button visible
           gameLoopId = requestAnimationFrame(gameLoop);
        }
    }

    // --- Initialization ---

    // Start Button Event Listener
    startButton.addEventListener('click', async () => {
        // Initialize sounds on first interaction
        if (!soundsInitialized) await initializeSounds();
        // Clear previous loop if any
        if (gameLoopId) { cancelAnimationFrame(gameLoopId); gameLoopId = null; }
        
        // Determine if starting fresh or continuing
        if (isGameOver || currentLevelIndex >= allLevelsData.length) { 
            startGame(true); // Start new game from level 1
        } else {
            startGame(false); // Continue to next level
        }
    });

    /** Checks if the device likely supports touch events. */
    function checkTouchDevice() {
        try { document.createEvent("TouchEvent"); return true; } 
        catch (e) { return false; }
    }

    // Show touch controls on touch devices or small screens
    if (checkTouchDevice() || window.innerWidth <= 768) {
        if(touchControlsDiv) touchControlsDiv.style.display = 'flex'; 
    }

    // Initial Screen Setup
    messagesDiv.textContent = "הרפתקאות בובו הארנב";
    startButton.textContent = "התחל משחק";
    startButton.style.display = 'block';
    draw(); // Draw the initial title screen

}); // End DOMContentLoaded
