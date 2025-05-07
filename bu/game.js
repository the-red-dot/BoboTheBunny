document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const messagesDiv = document.getElementById('messages');
    const startButton = document.getElementById('startButton');
    const heartsDisplay = document.getElementById('hearts');
    const carrotsCollectedDisplay = document.getElementById('carrotsCollected');
    const totalCarrotsDisplay = document.getElementById('totalCarrotsInLevel');

    // Game settings
    canvas.width = 800;
    canvas.height = 400;

    const GRAVITY = 0.6; // Slightly increased gravity
    const PLAYER_SPEED = 3.5;
    const PLAYER_RUN_SPEED = 6;
    const JUMP_FORCE = 13;
    const MIN_JUMP_HEIGHT = 5;

    // World and Camera
    const LEVEL_WIDTH = 3200; // Much wider level
    let cameraX = 0;

    let player, platforms, carrots, enemies, exit;
    let keys = {};
    let lives = 3;
    let requiredCarrots = 0;
    let collectedCarrotsCount = 0;
    let isGameOver = false;
    let gameStarted = false;
    let isInvincible = false;
    let invincibilityTimer = 0;
    const INVINCIBILITY_DURATION = 2000; // 2 seconds
    let currentSpeed = PLAYER_SPEED;

    let lastKeyPressTime = { 'ArrowLeft': 0, 'ArrowRight': 0 };
    const DOUBLE_TAP_THRESHOLD = 220; // milliseconds

    let gameLoopId; // To store the requestAnimationFrame ID

    function initGame() {
        isGameOver = false;
        gameStarted = true;
        startButton.style.display = 'none';
        messagesDiv.textContent = '';
        lives = 3;
        collectedCarrotsCount = 0;
        cameraX = 0; // Reset camera
        currentSpeed = PLAYER_SPEED;

        // Player object - worldX is its position in the entire level
        player = {
            worldX: 100, // Initial position in the world
            y: canvas.height - 100, // Start on a platform
            width: 30,
            height: 40,
            drawWidth: 30, // For crouch visual
            drawHeight: 40, // For crouch visual
            color: '#007bff', // Bobo the Rabbit - a nice blue
            velocityX: 0,
            velocityY: 0,
            isJumping: false,
            isOnGround: false,
            isCrouching: false,
            canVariableJump: false,
            jumpButtonPressedTime: 0
        };

        // Level 1: Spring Forest (Extended)
        platforms = [
            // Ground sections (not continuous, to allow falling off)
            { worldX: 0, y: canvas.height - 20, width: 400, height: 20, color: '#28a745' }, // Darker green
            { worldX: 500, y: canvas.height - 20, width: 600, height: 20, color: '#28a745' },
            { worldX: 1200, y: canvas.height - 20, width: 800, height: 20, color: '#28a745' },
            { worldX: 2100, y: canvas.height - 20, width: LEVEL_WIDTH - 2100, height: 20, color: '#28a745' },


            // Floating platforms - spread across the LEVEL_WIDTH
            { worldX: 150, y: canvas.height - 80, width: 100, height: 20, color: '#6f4e37' }, // Saddlebrown
            { worldX: 300, y: canvas.height - 140, width: 120, height: 20, color: '#6f4e37' },
            { worldX: 550, y: canvas.height - 100, width: 150, height: 20, color: '#6f4e37' },
            { worldX: 700, y: canvas.height - 180, width: 80, height: 20, color: '#6f4e37' },
            { worldX: 850, y: canvas.height - 120, width: 100, height: 20, color: '#6f4e37' },

            // Further platforms
            { worldX: 1000, y: canvas.height - 90, width: 130, height: 20, color: '#6f4e37' },
            { worldX: 1150, y: canvas.height - 150, width: 100, height: 20, color: '#6f4e37' },
            { worldX: 1300, y: canvas.height - 200, width: 120, height: 20, color: '#6f4e37' }, // Higher
            { worldX: 1500, y: canvas.height - 100, width: 150, height: 20, color: '#6f4e37' },
            { worldX: 1600, y: canvas.height - 160, width: 70, height: 20, color: '#6f4e37', type: 'moving', speed: 1, range: 50, dir: 1 }, // Moving platform
            { worldX: 1750, y: canvas.height - 130, width: 100, height: 20, color: '#6f4e37' },
            
            // Even further
            { worldX: 1900, y: canvas.height - 70, width: 90, height: 20, color: '#6f4e37' },
            { worldX: 2050, y: canvas.height - 140, width: 110, height: 20, color: '#6f4e37' },
            { worldX: 2200, y: canvas.height - 190, width: 100, height: 20, color: '#6f4e37' },
            { worldX: 2350, y: canvas.height - 100, width: 150, height: 20, color: '#6f4e37' },
            { worldX: 2500, y: canvas.height - 150, width: 80, height: 20, color: '#6f4e37' },
            { worldX: 2650, y: canvas.height - 220, width: 120, height: 20, color: '#6f4e37' }, // Higher
            { worldX: 2800, y: canvas.height - 120, width: 100, height: 20, color: '#6f4e37' },
            { worldX: 2950, y: canvas.height - 170, width: 130, height: 20, color: '#6f4e37', type: 'moving', speed: 1.5, range: 70, dir: 1 }, // Faster Moving platform
        ];

        carrots = [
            // Spread carrots
            { worldX: 180, y: canvas.height - 105, width: 15, height: 25, color: '#fd7e14', collected: false }, // Brighter orange
            { worldX: 350, y: canvas.height - 165, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 580, y: canvas.height - 125, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 720, y: canvas.height - 205, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 900, y: canvas.height - 50, width: 15, height: 25, color: '#fd7e14', collected: false },

            { worldX: 1050, y: canvas.height - 115, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 1200, y: canvas.height - 175, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 1350, y: canvas.height - 225, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 1550, y: canvas.height - 125, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 1780, y: canvas.height - 155, width: 15, height: 25, color: '#fd7e14', collected: false },

            { worldX: 1950, y: canvas.height - 95, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 2100, y: canvas.height - 165, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 2250, y: canvas.height - 215, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 2400, y: canvas.height - 125, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 2550, y: canvas.height - 175, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 2700, y: canvas.height - 245, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 2850, y: canvas.height - 145, width: 15, height: 25, color: '#fd7e14', collected: false },
            { worldX: 3000, y: canvas.height - 50, width: 15, height: 25, color: '#fd7e14', collected: false },
        ];
        requiredCarrots = carrots.length; // Collect all carrots

        enemies = [
            {
                worldX: 400, y: canvas.height - 50, width: 40, height: 30, color: '#dc3545', // Red
                speed: 1, originalSpeed: 1, direction: 1, patrolRange: { start: 300, end: 500 }
            },
            {
                worldX: 900, y: canvas.height - 50, width: 40, height: 30, color: '#dc3545',
                speed: 1.2, originalSpeed: 1.2, direction: 1, patrolRange: { start: 800, end: 1050 } // Slightly faster
            },
            {
                worldX: 1400, y: canvas.height - 50, width: 40, height: 30, color: '#c82333', // Darker red
                speed: 1.5, originalSpeed: 1.5, direction: -1, patrolRange: { start: 1250, end: 1500 } // Even faster
            },
            {
                worldX: 1650, y: canvas.height - 180 - 30, width: 40, height: 30, color: '#c82333', // On a platform
                speed: 1.3, originalSpeed: 1.3, direction: 1, patrolRange: { start: 1600, end: 1720 }
            },
            {
                worldX: 2000, y: canvas.height - 50, width: 45, height: 35, color: '#bf1c2c', // Larger and faster
                speed: 1.8, originalSpeed: 1.8, direction: 1, patrolRange: { start: 1900, end: 2200 }
            },
             {
                worldX: 2400, y: canvas.height - 50, width: 40, height: 30, color: '#dc3545',
                speed: 1.6, originalSpeed: 1.6, direction: -1, patrolRange: { start: 2300, end: 2550 }
            },
            {
                worldX: 2800, y: canvas.height - 120 - 30, width: 40, height: 30, color: '#c82333', // On a platform
                speed: 1.9, originalSpeed: 1.9, direction: 1, patrolRange: { start: 2800, end: 2900 }
            },
        ];

        exit = {
            worldX: LEVEL_WIDTH - 100, y: canvas.height - 60, width: 50, height: 50, color: '#6c757d', // Grey initially
            isOpen: false
        };

        updateHUD();

        if (!gameLoopId) {
             gameLoop();
        }
    }

    // --- Input Handling ---
    document.addEventListener('keydown', (e) => {
        keys[e.key] = true;
        if (isGameOver || !gameStarted) return;

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            const now = Date.now();
            if (now - lastKeyPressTime[e.key] < DOUBLE_TAP_THRESHOLD) {
                currentSpeed = PLAYER_RUN_SPEED;
            } else {
                currentSpeed = PLAYER_SPEED;
            }
            lastKeyPressTime[e.key] = now;
        }

        if ((e.key === 'ArrowUp' || e.key === ' ') && player.isOnGround && !player.isJumping) {
            player.isJumping = true;
            player.isOnGround = false;
            player.velocityY = -JUMP_FORCE;
            player.canVariableJump = true;
            player.jumpButtonPressedTime = Date.now();
        }

        if (e.key === 'ArrowDown') {
            if (!player.isCrouching && player.isOnGround) { // Can only crouch on ground
                player.isCrouching = true;
                player.drawHeight = 25; // Visual crouch
                player.drawWidth = 35; // Slightly wider when crouched
                // Adjust y for visual crouch if needed, but hitbox change is more important
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        keys[e.key] = false;
        if (isGameOver || !gameStarted) return;

        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            if (!keys['ArrowLeft'] && !keys['ArrowRight']) {
                currentSpeed = PLAYER_SPEED;
            }
        }
        
        if ((e.key === 'ArrowUp' || e.key === ' ') && player.canVariableJump) {
            player.canVariableJump = false;
            if (player.velocityY < -MIN_JUMP_HEIGHT) {
                 const pressDuration = Date.now() - player.jumpButtonPressedTime;
                 if (pressDuration < 150) { 
                    player.velocityY = -MIN_JUMP_HEIGHT * 1.5; 
                 }
            }
        }

        if (e.key === 'ArrowDown') {
            if (player.isCrouching) {
                player.isCrouching = false;
                player.drawHeight = player.height; // Restore original visual height
                player.drawWidth = player.width;
                // No need to adjust y if hitbox is managed correctly or if crouch is purely visual on top
            }
        }
    });

    // --- Update Functions ---
    function updatePlayer() {
        if (isGameOver) return;

        // Horizontal movement
        player.velocityX = 0;
        if (keys['ArrowLeft'] && !player.isCrouching) { // Cannot move while crouching in this version
            player.velocityX = -currentSpeed;
        }
        if (keys['ArrowRight'] && !player.isCrouching) {
            player.velocityX = currentSpeed;
        }

        player.worldX += player.velocityX;

        // Apply gravity
        player.velocityY += GRAVITY;
        player.y += player.velocityY;
        player.isOnGround = false;

        // World bounds for player (worldX)
        if (player.worldX < 0) player.worldX = 0;
        if (player.worldX + player.width > LEVEL_WIDTH) player.worldX = LEVEL_WIDTH - player.width;
        
        // Falling off world (bottom of canvas)
        if (player.y + player.height > canvas.height + 50) { // Give some leeway before dying
            loseLife(true); // true indicates fall death for specific reset
        }

        // Invincibility
        if (isInvincible) {
            invincibilityTimer -= 1000/60; 
            if (invincibilityTimer <= 0) {
                isInvincible = false;
            }
        }
    }

    function updateCamera() {
        // Camera follows player, keeping player roughly in the middle
        const targetCameraX = player.worldX - (canvas.width / 2 - player.width / 2);
        
        // Smooth camera movement (lerp)
        cameraX += (targetCameraX - cameraX) * 0.1;


        // Clamp camera to level boundaries
        if (cameraX < 0) cameraX = 0;
        if (cameraX > LEVEL_WIDTH - canvas.width) cameraX = LEVEL_WIDTH - canvas.width;
    }
    
    function updatePlatforms() {
        platforms.forEach(p => {
            if (p.type === 'moving') {
                p.originalWorldX = p.originalWorldX || p.worldX; // Store initial position
                p.worldX += p.speed * p.dir;
                if (Math.abs(p.worldX - p.originalWorldX) >= p.range) {
                    p.dir *= -1;
                }
            }
        });
    }


    function updateEnemies() {
        if (isGameOver) return;
        enemies.forEach(enemy => {
            // Progressive difficulty: slightly increase speed based on player progress (cameraX)
            // This is a simple way, could be more sophisticated
            const progressFactor = Math.min(1.5, 1 + (cameraX / LEVEL_WIDTH) * 0.5); // Max 50% speed increase
            enemy.speed = enemy.originalSpeed * progressFactor;

            enemy.worldX += enemy.speed * enemy.direction;
            if (enemy.worldX <= enemy.patrolRange.start || enemy.worldX + enemy.width >= enemy.patrolRange.end) {
                enemy.direction *= -1;
            }
        });
    }

    // --- Collision Detection ---
    function getPlayerHitbox() {
        // Hitbox changes when crouching
        if (player.isCrouching) {
            return {
                x: player.worldX,
                y: player.y + (player.height - player.drawHeight), // Hitbox starts from top of crouched player
                width: player.drawWidth,
                height: player.drawHeight
            };
        }
        return {
            x: player.worldX,
            y: player.y,
            width: player.width,
            height: player.height
        };
    }


    function checkCollisions() {
        if (isGameOver) return;
        const playerHitbox = getPlayerHitbox();

        // Player vs Platforms
        let onAnyPlatform = false;
        platforms.forEach(platform => {
            const platformHitbox = { x: platform.worldX, y: platform.y, width: platform.width, height: platform.height };
            if (isRectColliding(playerHitbox, platformHitbox)) {
                // Check for collision from top (landing on platform)
                const prevPlayerBottom = (player.y + playerHitbox.height) - player.velocityY;
                if (player.velocityY >= 0 && prevPlayerBottom <= platform.y + 1) {
                    player.y = platform.y - playerHitbox.height;
                    player.velocityY = 0;
                    player.isJumping = false;
                    player.isOnGround = true;
                    onAnyPlatform = true;

                    // Stick to moving platforms
                    if (platform.type === 'moving' && player.isOnGround) {
                        player.worldX += platform.speed * platform.dir;
                    }
                }
                // Check for collision from bottom (hitting head)
                else if (player.velocityY < 0 && player.y - player.velocityY >= platform.y + platform.height -1) {
                    player.y = platform.y + platform.height;
                    player.velocityY = 0;
                }
                // Check for collision from sides
                else {
                     if (player.velocityX > 0 && playerHitbox.x + playerHitbox.width - player.velocityX <= platform.worldX) {
                        player.worldX = platform.worldX - playerHitbox.width;
                        player.velocityX = 0;
                    } else if (player.velocityX < 0 && playerHitbox.x - player.velocityX >= platform.worldX + platform.width) {
                        player.worldX = platform.worldX + platform.width;
                        player.velocityX = 0;
                    }
                }
            }
        });
        if (!onAnyPlatform && player.y + playerHitbox.height < canvas.height -1) { // -1 to avoid issues with main ground
             // If not on any specific platform and not on main ground, should be falling
             // This logic might need refinement if there are gaps in the main ground
        }


        // Player vs Carrots
        carrots.forEach((carrot) => {
            if (!carrot.collected && isRectColliding(playerHitbox, {x: carrot.worldX, y: carrot.y, width: carrot.width, height: carrot.height})) {
                carrot.collected = true;
                collectedCarrotsCount++;
                updateHUD();
                checkLevelCompletion();
            }
        });

        // Player vs Enemies
        enemies.forEach(enemy => {
            const enemyHitbox = { x: enemy.worldX, y: enemy.y, width: enemy.width, height: enemy.height };
            if (isRectColliding(playerHitbox, enemyHitbox) && !isInvincible) {
                // Head jump to "defeat"
                const prevPlayerBottom = (player.y + playerHitbox.height) - player.velocityY;
                if (player.velocityY > 0 && prevPlayerBottom < enemy.y + 5 && !player.isCrouching) { // Can't stomp while crouching
                    enemies.splice(enemies.indexOf(enemy), 1); // Remove enemy
                    player.velocityY = -JUMP_FORCE / 1.5; // Small bounce
                    player.isJumping = true; // Allow another jump after stomp
                    player.isOnGround = false;
                } else {
                    loseLife();
                }
            }
        });

        // Player vs Exit
        if (exit.isOpen && isRectColliding(playerHitbox, {x: exit.worldX, y: exit.y, width: exit.width, height: exit.height})) {
            levelComplete();
        }
    }

    function isRectColliding(rect1, rect2) {
        return rect1.x < rect2.x + rect2.width &&
               rect1.x + rect1.width > rect2.x &&
               rect1.y < rect2.y + rect2.height &&
               rect1.y + rect1.height > rect2.y;
    }


    // --- Game State ---
    function loseLife(isFallDeath = false) {
        if (isInvincible || isGameOver) return;

        lives--;
        isInvincible = true;
        invincibilityTimer = INVINCIBILITY_DURATION;
        updateHUD();

        if (lives <= 0) {
            gameOver();
        } else {
            // Reset player position to a safe spot relative to current camera view or start of level segment
            // For simplicity, reset to a position slightly back from where they died, or near start if fall.
            if (isFallDeath) {
                 // Try to find the nearest platform below a certain point or reset more drastically
                player.worldX = Math.max(50, cameraX + 100); // Try to respawn in view
                player.y = canvas.height - 200; // Respawn higher up
            } else {
                player.worldX = Math.max(50, player.worldX - 50); // Move back a bit
                player.y = canvas.height - 100;
            }
            player.velocityX = 0;
            player.velocityY = 0;
            player.isCrouching = false; // Ensure not stuck crouching
            player.drawHeight = player.height;
            player.drawWidth = player.width;

            messagesDiv.textContent = "נפסלת! נסה שוב.";
            setTimeout(() => { if(!isGameOver) messagesDiv.textContent = ""; }, 2000);
        }
    }

    function gameOver() {
        isGameOver = true;
        gameStarted = false;
        messagesDiv.innerHTML = `אוי לא, נגמרו החיים!`;
        startButton.textContent = "שחק שוב";
        startButton.style.display = 'block';
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId);
            gameLoopId = null;
        }
    }

    function checkLevelCompletion() {
        if (collectedCarrotsCount >= requiredCarrots) {
            exit.isOpen = true;
            exit.color = '#FFD700'; // Gold to indicate open
        }
    }

    function levelComplete() {
        isGameOver = true;
        gameStarted = false;
        messagesDiv.textContent = `כל הכבוד! שלב הושלם! אספת ${collectedCarrotsCount} גזרים.`;
        startButton.textContent = "שחק שוב";
        startButton.style.display = 'block';
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId);
            gameLoopId = null;
        }
    }

    function updateHUD() {
        heartsDisplay.textContent = lives;
        carrotsCollectedDisplay.textContent = collectedCarrotsCount;
        totalCarrotsDisplay.textContent = requiredCarrots;
    }

    // --- Drawing ---
    function draw() {
        // Initial screen before game starts
        if (!gameStarted && !isGameOver) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#87CEEB'; // Default background
            ctx.fillRect(0,0, canvas.width, canvas.height);
            messagesDiv.textContent = "הרפתקאות בובו הארנב";
            startButton.style.display = 'block';
            startButton.textContent = "התחל משחק";
            return;
        }
        // If game over and not restarted, keep message
        if (isGameOver && !gameStarted) {
            return; 
        }

        // Clear canvas
        ctx.fillStyle = '#87CEEB'; // Sky Blue
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Parallax background (simple example)
        const bgMountainX = -(cameraX * 0.1) % canvas.width; // Slower scroll for mountains
        ctx.fillStyle = '#a0a0a0'; // Light grey for distant mountains
        // Simple triangle mountains
        for (let i = -1; i < (canvas.width / 200) + 1; i++) {
            ctx.beginPath();
            ctx.moveTo(bgMountainX + i * 200, canvas.height - 20); // Base of mountain on ground
            ctx.lineTo(bgMountainX + i * 200 + 100, canvas.height - 20 - 150); // Peak
            ctx.lineTo(bgMountainX + i * 200 + 200, canvas.height - 20); // Other base point
            ctx.closePath();
            ctx.fill();
        }
         const bgHillsX = -(cameraX * 0.3) % canvas.width; // Medium scroll for hills
        ctx.fillStyle = '#6B8E23'; // Olive Drab for closer hills
        for (let i = -1; i < (canvas.width / 150) +1; i++) {
            ctx.beginPath();
            ctx.arc(bgHillsX + i * 150 + 75, canvas.height - 20, 75, Math.PI, 2*Math.PI, false);
            ctx.fill();
        }


        // Save context before applying camera offset
        ctx.save();
        ctx.translate(-cameraX, 0);

        // Draw platforms
        platforms.forEach(platform => {
            ctx.fillStyle = platform.color;
            ctx.fillRect(platform.worldX, platform.y, platform.width, platform.height);
            // Add a little 3D effect to platforms
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(platform.worldX + 3, platform.y + platform.height -3, platform.width -6, 3);

        });

        // Draw carrots
        carrots.forEach(carrot => {
            if (!carrot.collected) {
                ctx.fillStyle = carrot.color;
                ctx.fillRect(carrot.worldX, carrot.y, carrot.width, carrot.height);
                ctx.fillStyle = '#228B22'; // Forest Green for top
                ctx.beginPath();
                ctx.moveTo(carrot.worldX + carrot.width / 2, carrot.y - 5);
                ctx.lineTo(carrot.worldX, carrot.y);
                ctx.lineTo(carrot.worldX + carrot.width, carrot.y);
                ctx.closePath();
                ctx.fill();
            }
        });

        // Draw enemies
        enemies.forEach(enemy => {
            ctx.fillStyle = enemy.color;
            ctx.fillRect(enemy.worldX, enemy.y, enemy.width, enemy.height);
            // Simple eyes
            ctx.fillStyle = 'white';
            const eyeXOffset = enemy.direction > 0 ? enemy.width * 0.6 : enemy.width * 0.2;
            ctx.fillRect(enemy.worldX + eyeXOffset, enemy.y + 5, 5, 5);
            ctx.fillRect(enemy.worldX + eyeXOffset + (enemy.direction > 0 ? 7 : -7) , enemy.y + 5, 5, 5);
            // Pupil
            ctx.fillStyle = 'black';
            ctx.fillRect(enemy.worldX + eyeXOffset + 1, enemy.y + 7, 2, 2);
            ctx.fillRect(enemy.worldX + eyeXOffset + (enemy.direction > 0 ? 7 : -7) + 1, enemy.y + 7, 2, 2);
        });

        // Draw exit
        ctx.fillStyle = exit.color;
        ctx.fillRect(exit.worldX, exit.y, exit.width, exit.height);
        // Simple door shape on exit
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(exit.worldX + exit.width * 0.2, exit.y + exit.height * 0.2, exit.width*0.6, exit.height*0.8);
        if (exit.isOpen) {
            ctx.fillStyle = 'black';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText("יציאה", exit.worldX + exit.width / 2, exit.y + exit.height / 2 + 5);
        }


        // Draw player
        if (isInvincible) {
            ctx.globalAlpha = (Math.floor(Date.now() / 100) % 2 === 0) ? 0.4 : 0.8;
        }
        
        const playerDrawX = player.worldX; // Player's actual world X for drawing relative to camera
        let playerVisualY = player.y;
        if (player.isCrouching) {
             playerVisualY = player.y + (player.height - player.drawHeight); // Adjust visual Y when crouching
        }

        ctx.fillStyle = player.color;
        ctx.fillRect(playerDrawX, playerVisualY, player.drawWidth, player.drawHeight);
        
        // Simple "ears" for Bobo
        const earHeight = 12;
        const earWidth = 7;
        ctx.fillStyle = player.isCrouching ? player.color : '#ffc0cb'; // Pink inner ear, or body color if crouched
        ctx.fillRect(playerDrawX + player.drawWidth * 0.2 - earWidth/2, playerVisualY - earHeight + (player.isCrouching ? 5:0), earWidth, earHeight);
        ctx.fillRect(playerDrawX + player.drawWidth * 0.8 - earWidth/2, playerVisualY - earHeight+ (player.isCrouching ? 5:0), earWidth, earHeight);
        
        ctx.globalAlpha = 1.0; // Reset alpha

        // Restore context to remove camera offset for HUD or other static elements
        ctx.restore();
    }

    // --- Game Loop ---
    function gameLoop() {
        if (!isGameOver && gameStarted) {
            updatePlayer();
            updateCamera(); // Update camera based on player's new worldX
            updateEnemies();
            updatePlatforms(); // For moving platforms
            checkCollisions();
        }
        draw();
        // Continue loop if game is active OR on start/gameover screen (to allow restart)
        if (gameStarted || !isGameOver || startButton.style.display === 'block') {
           gameLoopId = requestAnimationFrame(gameLoop);
        }
    }

    // --- Start Button ---
    startButton.addEventListener('click', () => {
        if (gameLoopId) { // Clear previous loop if any (e.g. after game over)
            cancelAnimationFrame(gameLoopId);
            gameLoopId = null;
        }
        initGame();
    });

    // Initial setup message and draw
    messagesDiv.textContent = "לחץ על 'התחל משחק' כדי להתחיל.";
    startButton.style.display = 'block';
    draw(); // Draw initial screen
});
