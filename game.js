// 게임 상태
const gameState = {
    isPlaying: false,
    isPaused: false,
    score: 0,
    buildingNumber: 1,
    currentBuilding: null,
    slashDirection: 'left', // 'left' 또는 'right'
    cameraY: 0, // 카메라 Y 오프셋
    hasSuperSword: false // 짱센검 구매 여부
};

// 캔버스 설정
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// 캔버스 크기 설정
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// 게임 상수
const GRAVITY = 0.8;
const JUMP_POWER = -30;
const PLAYER_SPEED = 5;
const BUILDING_FALL_SPEED = 3;
const FLOOR_HEIGHT = 40;
const FLOOR_HP = 3;
const BUILDING_FLOORS = 10;

// 효과음 시스템
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playSlashSound() {
    try {
        // 칼 소리 생성 (짧은 노이즈와 금속성 소리)
        const now = audioContext.currentTime;
        
        // 화이트 노이즈 생성
        const bufferSize = audioContext.sampleRate * 0.1; // 0.1초
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;
        
        // 필터로 칼 소리 특성 만들기
        const filter = audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 2000;
        
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        
        // 연결
        noise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // 재생
        noise.start(now);
        noise.stop(now + 0.1);
    } catch (error) {
        console.log('효과음 재생 실패:', error);
    }
}

// 충돌 감지 헬퍼 함수
function checkCollision(player, building) {
    if (!building || building.destroyed) return false;
    
    return player.x < building.x + building.width &&
           player.x + player.width > building.x &&
           player.y < building.y + building.height &&
           player.y + player.height > building.y;
}

// 플레이어
const player = {
    x: 0,
    y: 0,
    width: 90,
    height: 120,
    velocityY: 0,
    isJumping: false,
    isSlashing: false,
    slashCooldown: 0,
    slashAnimationTimer: 0,
    attackPower: 1, // 기본 공격력
    image: new Image(),
    imageLeft: new Image(),
    imageRight: new Image(),
    
    init() {
        this.x = canvas.width / 2 - this.width / 2;
        this.y = canvas.height - 100 - this.height;
        
        // 이미지 로드
        this.image.src = './images/sol.png';
        this.imageLeft.src = './images/sol_left.png';
        this.imageRight.src = './images/sol_right.png';
        
        // 이미지 로드 실패 시 처리
        this.image.onerror = () => {
            console.log('기본 이미지를 찾을 수 없습니다. 플레이스홀더를 사용합니다.');
        };
    },
    
    jump() {
        if (!this.isJumping && gameState.isPlaying) {
            // 점프는 땅이나 건물에 착지했을 때만 가능
            this.velocityY = JUMP_POWER;
            this.isJumping = true;
            
            // 점프 시 건물 2층만큼 밀기 (건물에 닿았을 때만)
            if (gameState.currentBuilding && !gameState.currentBuilding.destroyed) {
                if (checkCollision(this, gameState.currentBuilding)) {
                    gameState.currentBuilding.push(FLOOR_HEIGHT * 2);
                }
            }
        }
    },
    
    slash() {
        if (gameState.isPlaying) {
            // 칼 소리 효과음 재생
            playSlashSound();
            
            // 베기 애니메이션은 항상 실행
            this.isSlashing = true;
            this.slashAnimationTimer = 15;
            
            // 베기 방향 전환 (왼쪽 -> 오른쪽 -> 왼쪽)
            gameState.slashDirection = gameState.slashDirection === 'left' ? 'right' : 'left';
            
            // 캐릭터 위쪽 3층 높이 범위 내에 건물이 있으면 데미지 적용 (x축 상관없음)
            if (gameState.currentBuilding && !gameState.currentBuilding.destroyed) {
                const building = gameState.currentBuilding;
                
                // Y축 범위 체크 (캐릭터 위쪽 3층 높이 범위 내)
                const buildingBottom = building.y + building.height;
                const playerTop = this.y;
                const yInRange = buildingBottom >= playerTop - FLOOR_HEIGHT * 3 &&
                                 buildingBottom <= playerTop + FLOOR_HEIGHT * 3;
                
                if (yInRange) {
                    gameState.currentBuilding.takeDamage(this.attackPower);
                    gameState.score += this.attackPower;
                    updateScore();
                }
            }
        }
    },
    
    update() {
        // 중력 적용
        this.velocityY += GRAVITY;
        this.y += this.velocityY;
        
        // 바닥 충돌
        const groundY = canvas.height - 100 - this.height;
        if (this.y >= groundY) {
            this.y = groundY;
            this.velocityY = 0;
            this.isJumping = false;
        }
        
        // 플레이어가 지면에 완전히 붙어있는지 확인
        const isOnGround = this.y >= groundY - 5;
        
        // 건물과의 충돌 처리 (건물을 통과하지 못하도록)
        if (gameState.currentBuilding && !gameState.currentBuilding.destroyed) {
            const building = gameState.currentBuilding;
            
            // 지면에 있을 때 게임 오버 체크 (캐릭터 높이 0.5배 위에 건물이 있으면)
            if (isOnGround) {
                const buildingBottom = building.y + building.height;
                const dangerZoneTop = this.y - this.height * 0.5;
                
                // X축으로 건물과 플레이어가 겹치는지 확인
                const xOverlap = this.x < building.x + building.width &&
                                 this.x + this.width > building.x;
                
                // 건물이 플레이어 위에 있고, 위험 구역 내에 있으면 게임 오버
                if (xOverlap && buildingBottom >= dangerZoneTop && buildingBottom <= this.y) {
                    gameOver();
                    return;
                }
            }
            
            // 플레이어가 건물과 겹치는지 확인
            if (checkCollision(this, building)) {
                // 플레이어가 건물 위에 있는 경우 (아래로 떨어지는 중)
                if (this.velocityY > 0 && this.y < building.y + building.height - 10) {
                    this.y = building.y - this.height;
                    this.velocityY = 0;
                    this.isJumping = false;
                }
                // 플레이어가 건물 아래에서 점프하는 경우 (위로 올라가는 중)
                else if (this.velocityY < 0 && this.y > building.y) {
                    // 건물을 2층 위로 밀기
                    building.push(FLOOR_HEIGHT * 2);
                    // 플레이어를 건물 하단에 막기 (통과하지 못하도록)
                    this.y = building.y + building.height;
                    this.velocityY = 0;
                }
            }
        }
        
        // 카메라 업데이트 (플레이어를 따라가도록)
        const targetCameraY = Math.min(0, canvas.height * 0.6 - this.y);
        gameState.cameraY += (targetCameraY - gameState.cameraY) * 0.1;
        
        // 쿨다운 감소
        if (this.slashCooldown > 0) this.slashCooldown--;
        if (this.slashAnimationTimer > 0) {
            this.slashAnimationTimer--;
        } else {
            this.isSlashing = false;
        }
    },
    
    draw() {
        const drawY = this.y + gameState.cameraY;
        
        // 이미지 선택
        let img = this.image;
        if (this.isSlashing) {
            img = gameState.slashDirection === 'left' ? this.imageLeft : this.imageRight;
        }
        
        // 이미지가 로드되었으면 이미지 그리기, 아니면 사각형
        if (img.complete && img.naturalWidth !== 0) {
            ctx.drawImage(img, this.x, drawY, this.width, this.height);
        } else {
            // 플레이스홀더
            ctx.fillStyle = '#FF6B6B';
            ctx.fillRect(this.x, drawY, this.width, this.height);
            
            // 얼굴
            ctx.fillStyle = '#FFE66D';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, drawY + 20, 15, 0, Math.PI * 2);
            ctx.fill();
            
            // 눈
            ctx.fillStyle = '#000';
            ctx.fillRect(this.x + this.width / 2 - 8, drawY + 15, 4, 4);
            ctx.fillRect(this.x + this.width / 2 + 4, drawY + 15, 4, 4);
            
            if (this.isSlashing) {
                // 칼 그리기
                ctx.strokeStyle = '#FFF';
                ctx.lineWidth = 3;
                ctx.beginPath();
                if (gameState.slashDirection === 'left') {
                    ctx.moveTo(this.x, drawY + this.height / 2);
                    ctx.lineTo(this.x - 30, drawY + this.height / 2 - 20);
                } else {
                    ctx.moveTo(this.x + this.width, drawY + this.height / 2);
                    ctx.lineTo(this.x + this.width + 30, drawY + this.height / 2 - 20);
                }
                ctx.stroke();
            }
        }
    }
};

// 건물
class Building {
    constructor(hpPerFloor, startY = null) {
        this.width = canvas.width * 2 / 3;
        this.totalFloors = BUILDING_FLOORS;
        this.floorHeight = FLOOR_HEIGHT;
        this.height = this.totalFloors * this.floorHeight;
        this.x = canvas.width / 2 - this.width / 2;
        // startY가 제공되면 그 위치에서 시작, 아니면 화면 위에서 시작
        this.y = startY !== null ? startY : -this.height;
        this.velocityY = BUILDING_FALL_SPEED;
        this.pushVelocity = 0; // 밀리는 속도
        this.hpPerFloor = hpPerFloor;
        this.destroyed = false;
        
        // 건물 타입 랜덤 선택
        const buildingTypes = ['업무', '스트레스', '민원', '숙취'];
        this.buildingType = buildingTypes[Math.floor(Math.random() * buildingTypes.length)];
        
        // 각 층의 체력 초기화
        this.floors = [];
        for (let i = 0; i < this.totalFloors; i++) {
            this.floors.push({
                hp: this.hpPerFloor,
                maxHp: this.hpPerFloor
            });
        }
    }
    
    push(amount) {
        // 즉시 이동하는 대신 밀리는 속도를 추가
        this.pushVelocity -= amount / 10; // 부드럽게 밀리도록 속도로 변환
    }
    
    takeDamage(damage = 1) {
        // 가장 아래층부터 데미지
        let remainingDamage = damage;
        
        for (let i = this.totalFloors - 1; i >= 0 && remainingDamage > 0; i--) {
            if (this.floors[i].hp > 0) {
                const damageToFloor = Math.min(this.floors[i].hp, remainingDamage);
                this.floors[i].hp -= damageToFloor;
                remainingDamage -= damageToFloor;
                
                // 해당 층이 파괴되면 층 제거
                if (this.floors[i].hp <= 0) {
                    this.floors.pop();
                    this.totalFloors--;
                    this.height = this.totalFloors * this.floorHeight;
                    
                    // 모든 층이 파괴되면
                    if (this.totalFloors <= 0) {
                        this.destroyed = true;
                        gameState.buildingNumber++;
                        updateBuildingNumber();
                        
                        // 다음 건물 생성 (화면 위에서 시작)
                        const nextHpPerFloor = FLOOR_HP + (gameState.buildingNumber - 1) * 2;
                        const newBuilding = new Building(nextHpPerFloor);
                        // 화면에 보이는 가장 위에서 시작
                        newBuilding.y = -gameState.cameraY - newBuilding.height;
                        gameState.currentBuilding = newBuilding;
                        break;
                    }
                }
            }
        }
    }
    
    update() {
        if (this.destroyed) return;
        
        // 밀리는 속도 적용 (부드러운 애니메이션)
        if (Math.abs(this.pushVelocity) > 0.1) {
            this.y += this.pushVelocity;
            // 감쇠 효과 (0.9를 곱해서 점점 느려지게)
            this.pushVelocity *= 0.9;
        } else {
            this.pushVelocity = 0;
        }
        
        // 기본 낙하 속도 적용
        this.y += this.velocityY;
        
        // 플레이어와 충돌 체크 (건물이 지면에 닿았을 때)
        const groundY = canvas.height - 100;
        if (this.y + this.height >= groundY) {
            // 건물이 땅에 닿았으면 제거하고 새 건물 생성
            this.destroyed = true;
            gameState.buildingNumber++;
            updateBuildingNumber();
            
            // 다음 건물 생성 (화면 위에서 시작)
            const nextHpPerFloor = FLOOR_HP + (gameState.buildingNumber - 1) * 2;
            const newBuilding = new Building(nextHpPerFloor);
            // 화면에 보이는 가장 위에서 시작
            newBuilding.y = -gameState.cameraY - newBuilding.height;
            gameState.currentBuilding = newBuilding;
        }
    }
    
    draw() {
        if (this.destroyed) return;
        
        // 건물 그리기 (비트코인 건물)
        for (let i = 0; i < this.totalFloors; i++) {
            const floorY = this.y + i * this.floorHeight + gameState.cameraY;
            const floor = this.floors[i];
            
            // 체력에 따라 색상 변경
            const hpRatio = floor.hp / floor.maxHp;
            let color;
            if (hpRatio > 0.66) {
                color = '#F7931A'; // 비트코인 오렌지
            } else if (hpRatio > 0.33) {
                color = '#FFB84D';
            } else {
                color = '#FFD699';
            }
            
            ctx.fillStyle = color;
            ctx.fillRect(this.x, floorY, this.width, this.floorHeight - 2);
            
            // 층 테두리
            ctx.strokeStyle = '#CC7A00';
            ctx.lineWidth = 2;
            ctx.strokeRect(this.x, floorY, this.width, this.floorHeight - 2);
            
            // 건물 타입 텍스트 표시
            ctx.fillStyle = '#FFF';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(this.buildingType, this.x + this.width / 2, floorY + this.floorHeight / 2 + 8);
            
            // 체력 표시
            ctx.fillStyle = '#000';
            ctx.font = 'bold 14px Arial';
            ctx.fillText(`${floor.hp}/${floor.maxHp}`, this.x + this.width / 2, floorY + this.floorHeight - 8);
        }
    }
}

// 배경
function drawBackground() {
    // 하늘 (그라데이션)
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#E0F6FF');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 구름 (패럴랙스 효과)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    const cloudOffset = gameState.cameraY * 0.3; // 구름은 천천히 이동
    drawCloud(100, 80 + cloudOffset, 60);
    drawCloud(300, 120 + cloudOffset, 80);
    drawCloud(500, 60 + cloudOffset, 70);
    drawCloud(700, 100 + cloudOffset, 90);
    
    // 땅
    const groundY = canvas.height - 100 + gameState.cameraY;
    ctx.fillStyle = '#8B7355';
    ctx.fillRect(0, groundY, canvas.width, 100);
    
    // 잔디
    ctx.fillStyle = '#90EE90';
    ctx.fillRect(0, groundY, canvas.width, 20);
}

function drawCloud(x, y, size) {
    ctx.beginPath();
    ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    ctx.arc(x + size * 0.5, y, size * 0.6, 0, Math.PI * 2);
    ctx.arc(x + size, y, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
}

// 게임 루프
function gameLoop() {
    if (!gameState.isPlaying) return;
    
    // 배경 그리기
    drawBackground();
    
    // 일시정지가 아닐 때만 업데이트
    if (!gameState.isPaused) {
        player.update();
        if (gameState.currentBuilding) {
            gameState.currentBuilding.update();
        }
    }
    
    // 그리기는 항상 수행
    player.draw();
    if (gameState.currentBuilding) {
        gameState.currentBuilding.draw();
    }
    
    requestAnimationFrame(gameLoop);
}

// UI 업데이트
function updateScore() {
    document.getElementById('score').textContent = gameState.score;
}

function updateBuildingNumber() {
    document.getElementById('buildingNumber').textContent = gameState.buildingNumber;
}

// 게임 시작
function startGame() {
    gameState.isPlaying = true;
    gameState.isPaused = false;
    gameState.score = 0;
    gameState.buildingNumber = 1;
    gameState.slashDirection = 'left';
    gameState.cameraY = 0;
    gameState.hasSuperSword = false;
    
    player.init();
    player.attackPower = 1; // 기본 공격력으로 초기화
    
    // 첫 번째 건물 생성
    gameState.currentBuilding = new Building(FLOOR_HP);
    
    // UI 전환
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameScreen').classList.remove('hidden');
    
    updateScore();
    updateBuildingNumber();
    
    gameLoop();
}

// 게임 오버
function gameOver() {
    gameState.isPlaying = false;
    
    // 최종 점수 표시
    document.getElementById('finalScore').textContent = gameState.score;
    
    // 최고 점수 저장 및 표시
    saveHighScore(gameState.score);
    displayHighScores();
    
    // UI 전환
    document.getElementById('gameScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.remove('hidden');
}

// 최고 점수 저장
function saveHighScore(score) {
    let highScores = JSON.parse(localStorage.getItem('buildingGameHighScores')) || [];
    highScores.push(score);
    highScores.sort((a, b) => b - a);
    highScores = highScores.slice(0, 5); // 상위 5개만
    localStorage.setItem('buildingGameHighScores', JSON.stringify(highScores));
}

// 최고 점수 표시
function displayHighScores() {
    const highScores = JSON.parse(localStorage.getItem('buildingGameHighScores')) || [];
    const list = document.getElementById('highscoreList');
    list.innerHTML = '';
    
    if (highScores.length === 0) {
        list.innerHTML = '<li>아직 기록이 없습니다</li>';
    } else {
        highScores.forEach((score, index) => {
            const li = document.createElement('li');
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📊';
            li.textContent = `${medal} ${score} 점`;
            list.appendChild(li);
        });
    }
}

// 게임 재시작
function restartGame() {
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('startScreen').classList.remove('hidden');
}

// 상점 열기
function openShop() {
    if (!gameState.isPlaying) return;
    
    gameState.isPaused = true;
    document.getElementById('shopScreen').classList.remove('hidden');
    document.getElementById('shopScore').textContent = gameState.score;
    
    // 구매 상태 업데이트
    const buyBtn = document.getElementById('buySwordBtn');
    const status = document.getElementById('purchaseStatus');
    
    if (gameState.hasSuperSword) {
        buyBtn.disabled = true;
        buyBtn.textContent = '구매 완료';
        status.textContent = '⚔️ 짱센검을 이미 보유하고 있습니다!';
        status.className = 'purchase-status success';
        status.classList.remove('hidden');
    } else {
        buyBtn.disabled = false;
        buyBtn.textContent = '구매하기';
        status.classList.add('hidden');
    }
}

// 상점 닫기
function closeShop() {
    gameState.isPaused = false;
    document.getElementById('shopScreen').classList.add('hidden');
}

// 짱센검 구매
function buySuperSword() {
    if (gameState.hasSuperSword) {
        return;
    }
    
    const status = document.getElementById('purchaseStatus');
    
    if (gameState.score < 100) {
        status.textContent = '❌ 점수가 부족합니다! (필요: 100점)';
        status.className = 'purchase-status error';
        status.classList.remove('hidden');
        return;
    }
    
    // 구매 처리
    gameState.score -= 100;
    gameState.hasSuperSword = true;
    player.attackPower = 10;
    
    // 이미지 변경
    player.image.src = './images/sol_1.png';
    player.imageLeft.src = './images/sol_1_left.png';
    player.imageRight.src = './images/sol_1_right.png';
    
    updateScore();
    document.getElementById('shopScore').textContent = gameState.score;
    
    // 구매 완료 표시
    const buyBtn = document.getElementById('buySwordBtn');
    buyBtn.disabled = true;
    buyBtn.textContent = '구매 완료';
    
    status.textContent = '✅ 짱센검 구매 완료! 공격력 10배 증가!';
    status.className = 'purchase-status success';
    status.classList.remove('hidden');
}

// 키보드 입력
document.addEventListener('keydown', (e) => {
    if (!gameState.isPlaying || gameState.isPaused) return;
    
    if (e.key === 'ArrowUp' || e.key === ' ') {
        e.preventDefault();
    }
    
    if (e.key === 'ArrowUp') {
        player.jump();
    } else if (e.key === ' ') {
        player.slash();
    }
});

// 버튼 이벤트
document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('restartBtn').addEventListener('click', restartGame);
document.getElementById('jumpBtn').addEventListener('click', () => {
    if (!gameState.isPaused) player.jump();
});
document.getElementById('slashBtn').addEventListener('click', () => {
    if (!gameState.isPaused) player.slash();
});
document.getElementById('shopBtn').addEventListener('click', openShop);
document.getElementById('closeShopBtn').addEventListener('click', closeShop);
document.getElementById('buySwordBtn').addEventListener('click', buySuperSword);

// 모바일 터치 이벤트
document.getElementById('jumpBtn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!gameState.isPaused) player.jump();
});

document.getElementById('slashBtn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!gameState.isPaused) player.slash();
});

document.getElementById('shopBtn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    openShop();
});

// 모바일 최적화: 스크롤 및 줌 방지
document.addEventListener('touchmove', (e) => {
    if (e.target === canvas || e.target.classList.contains('control-btn')) {
        e.preventDefault();
    }
}, { passive: false });

// 이중 탭 줌 방지
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, { passive: false });

// 캔버스 크기 조정 시 게임 요소도 재배치
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        resizeCanvas();
        if (gameState.isPlaying && player) {
            player.x = canvas.width / 2 - player.width / 2;
        }
    }, 100);
});
