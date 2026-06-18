import Phaser from "phaser";

export type GameStatus = "running" | "choosing" | "won" | "lost";

export type GameStats = {
  status: GameStatus;
  health: number;
  maxHealth: number;
  level: number;
  xp: number;
  xpToNext: number;
  kills: number;
  score: number;
  timeLeft: number;
  survivalGoal: number;
  damage: number;
  bulletCount: number;
  fireDelay: number;
  speed: number;
};

export type UpgradeId =
  | "rapid"
  | "split"
  | "damage"
  | "speed"
  | "vital"
  | "magnet";

export type UpgradeOption = {
  id: UpgradeId;
  title: string;
  description: string;
};

export type GameResult = {
  outcome: "won" | "lost";
  kills: number;
  score: number;
  level: number;
  survivedSeconds: number;
};

type SceneCallbacks = {
  onStats: (stats: GameStats) => void;
  onUpgrade: (options: UpgradeOption[]) => void;
  onResult: (result: GameResult) => void;
};

type ArcadeOverlapObject =
  | Phaser.Types.Physics.Arcade.GameObjectWithBody
  | Phaser.Physics.Arcade.Body
  | Phaser.Physics.Arcade.StaticBody
  | Phaser.Tilemaps.Tile;

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const SURVIVAL_GOAL = 90;

const UPGRADE_POOL: UpgradeOption[] = [
  {
    id: "rapid",
    title: "Rapid Focus",
    description: "自动攻击间隔缩短，适合清理大量小怪。",
  },
  {
    id: "split",
    title: "Split Shot",
    description: "每次攻击多发射一枚弹体，扩大覆盖范围。",
  },
  {
    id: "damage",
    title: "Heavy Core",
    description: "弹体伤害提升，更快击杀精英怪。",
  },
  {
    id: "speed",
    title: "Shadow Step",
    description: "移动速度提升，提高走位容错。",
  },
  {
    id: "vital",
    title: "Vital Spark",
    description: "最大生命值提高，并立即回复一部分生命。",
  },
  {
    id: "magnet",
    title: "Magnet Field",
    description: "经验晶体吸附范围扩大，升级节奏更稳定。",
  },
];

export class SurvivorScene extends Phaser.Scene {
  private callbacks: SceneCallbacks;
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private gems!: Phaser.Physics.Arcade.Group;
  private status: GameStatus = "running";
  private health = 100;
  private maxHealth = 100;
  private level = 1;
  private xp = 0;
  private xpToNext = 6;
  private kills = 0;
  private score = 0;
  private elapsedSeconds = 0;
  private spawnAccumulator = 0;
  private fireAccumulator = 0;
  private contactCooldown = 0;
  private statsAccumulator = 0;
  private playerSpeed = 215;
  private bulletDamage = 1;
  private bulletCount = 1;
  private fireDelay = 520;
  private pickupRadius = 70;

  constructor(callbacks: SceneCallbacks) {
    super("SurvivorScene");
    this.callbacks = callbacks;
  }

  create() {
    this.status = "running";
    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.createTextures();
    this.createArena();

    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.gems = this.physics.add.group();

    this.player = this.physics.add.sprite(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      "player",
    );
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(20);
    this.player.body?.setCircle(14, 2, 2);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys("W,A,S,D") as Record<
      "W" | "A" | "S" | "D",
      Phaser.Input.Keyboard.Key
    >;

    this.physics.add.overlap(
      this.bullets,
      this.enemies,
      this.handleBulletEnemy,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player,
      this.enemies,
      this.handlePlayerEnemy,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player,
      this.gems,
      this.handlePlayerGem,
      undefined,
      this,
    );

    this.spawnEnemy();
    this.emitStats();
  }

  update(_time: number, delta: number) {
    if (this.status !== "running") {
      return;
    }

    const deltaSeconds = delta / 1000;
    this.elapsedSeconds += deltaSeconds;
    this.spawnAccumulator += delta;
    this.fireAccumulator += delta;
    this.contactCooldown = Math.max(0, this.contactCooldown - delta);
    this.statsAccumulator += delta;

    this.updatePlayerMovement();
    this.updateEnemies();
    this.updateGems();

    const spawnInterval = Math.max(330, 920 - this.elapsedSeconds * 6);
    if (this.spawnAccumulator >= spawnInterval) {
      this.spawnAccumulator = 0;
      this.spawnEnemy();
      if (this.elapsedSeconds > 40 && Math.random() > 0.62) {
        this.spawnEnemy(true);
      }
    }

    if (this.fireAccumulator >= this.fireDelay) {
      this.fireAccumulator = 0;
      this.fireAtNearestEnemy();
    }

    if (this.statsAccumulator >= 120) {
      this.statsAccumulator = 0;
      this.emitStats();
    }

    if (this.elapsedSeconds >= SURVIVAL_GOAL) {
      this.finishGame("won");
    }
  }

  applyUpgrade(id: UpgradeId) {
    if (this.status !== "choosing") {
      return;
    }

    if (id === "rapid") {
      this.fireDelay = Math.max(180, this.fireDelay - 75);
    }
    if (id === "split") {
      this.bulletCount = Math.min(5, this.bulletCount + 1);
    }
    if (id === "damage") {
      this.bulletDamage += 1;
    }
    if (id === "speed") {
      this.playerSpeed += 28;
    }
    if (id === "vital") {
      this.maxHealth += 24;
      this.health = Math.min(this.maxHealth, this.health + 34);
    }
    if (id === "magnet") {
      this.pickupRadius += 34;
    }

    this.status = "running";
    this.physics.resume();
    this.emitStats();
  }

  private createArena() {
    const graphics = this.add.graphics();
    graphics.fillStyle(0x121826, 1);
    graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    graphics.lineStyle(1, 0x243246, 0.55);
    for (let x = 0; x <= GAME_WIDTH; x += 48) {
      graphics.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y <= GAME_HEIGHT; y += 48) {
      graphics.lineBetween(0, y, GAME_WIDTH, y);
    }

    graphics.fillStyle(0x2f7b74, 0.18);
    for (let i = 0; i < 46; i += 1) {
      graphics.fillCircle(
        Phaser.Math.Between(18, GAME_WIDTH - 18),
        Phaser.Math.Between(18, GAME_HEIGHT - 18),
        Phaser.Math.Between(1, 3),
      );
    }
    graphics.setDepth(-10);
  }

  private createTextures() {
    if (this.textures.exists("player")) {
      return;
    }

    const graphics = this.add.graphics();

    graphics.fillStyle(0x70f0d6, 1);
    graphics.fillCircle(16, 16, 14);
    graphics.lineStyle(3, 0xe8fff8, 1);
    graphics.strokeCircle(16, 16, 13);
    graphics.generateTexture("player", 32, 32);
    graphics.clear();

    graphics.fillStyle(0xff5d57, 1);
    graphics.fillTriangle(16, 1, 31, 30, 1, 30);
    graphics.lineStyle(2, 0xffcdc8, 1);
    graphics.strokeTriangle(16, 1, 31, 30, 1, 30);
    graphics.generateTexture("enemy", 32, 32);
    graphics.clear();

    graphics.fillStyle(0xb13f8a, 1);
    graphics.fillCircle(18, 18, 17);
    graphics.lineStyle(3, 0xffaddc, 1);
    graphics.strokeCircle(18, 18, 16);
    graphics.generateTexture("brute", 36, 36);
    graphics.clear();

    graphics.fillStyle(0x82e6ff, 1);
    graphics.fillCircle(7, 7, 6);
    graphics.generateTexture("bullet", 14, 14);
    graphics.clear();

    graphics.fillStyle(0xffd166, 1);
    graphics.fillTriangle(8, 0, 16, 8, 8, 16);
    graphics.fillTriangle(8, 0, 8, 16, 0, 8);
    graphics.lineStyle(1, 0xfff5c2, 1);
    graphics.strokeCircle(8, 8, 7);
    graphics.generateTexture("gem", 16, 16);
    graphics.destroy();
  }

  private updatePlayerMovement() {
    const moveX =
      (this.cursors.left.isDown || this.keys.A.isDown ? -1 : 0) +
      (this.cursors.right.isDown || this.keys.D.isDown ? 1 : 0);
    const moveY =
      (this.cursors.up.isDown || this.keys.W.isDown ? -1 : 0) +
      (this.cursors.down.isDown || this.keys.S.isDown ? 1 : 0);

    const vector = new Phaser.Math.Vector2(moveX, moveY);
    if (vector.lengthSq() > 0) {
      vector.normalize().scale(this.playerSpeed);
      this.player.setVelocity(vector.x, vector.y);
    } else {
      this.player.setVelocity(0, 0);
    }
  }

  private updateEnemies() {
    this.enemies.children.each((child) => {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) {
        return true;
      }
      const speed = enemy.getData("speed") as number;
      this.physics.moveToObject(enemy, this.player, speed);
      enemy.rotation = Phaser.Math.Angle.Between(
        enemy.x,
        enemy.y,
        this.player.x,
        this.player.y,
      );
      return true;
    });
  }

  private updateGems() {
    this.gems.children.each((child) => {
      const gem = child as Phaser.Physics.Arcade.Sprite;
      if (!gem.active) {
        return true;
      }
      const distance = Phaser.Math.Distance.Between(
        gem.x,
        gem.y,
        this.player.x,
        this.player.y,
      );
      if (distance <= this.pickupRadius) {
        this.physics.moveToObject(gem, this.player, 300);
      } else {
        gem.setVelocity(0, 0);
      }
      return true;
    });
  }

  private spawnEnemy(isElite = false) {
    const edge = Phaser.Math.Between(0, 3);
    const padding = 34;
    let x = Phaser.Math.Between(0, GAME_WIDTH);
    let y = Phaser.Math.Between(0, GAME_HEIGHT);

    if (edge === 0) {
      x = -padding;
    }
    if (edge === 1) {
      x = GAME_WIDTH + padding;
    }
    if (edge === 2) {
      y = -padding;
    }
    if (edge === 3) {
      y = GAME_HEIGHT + padding;
    }

    const elapsedBoost = Math.floor(this.elapsedSeconds / 25);
    const enemy = this.physics.add.sprite(
      x,
      y,
      isElite ? "brute" : "enemy",
    );
    enemy.setDepth(12);
    enemy.setData("health", isElite ? 5 + elapsedBoost : 2 + elapsedBoost);
    enemy.setData("value", isElite ? 45 : 15);
    enemy.setData("xp", isElite ? 3 : 1);
    enemy.setData("damage", isElite ? 18 : 10);
    enemy.setData("speed", isElite ? 76 : Phaser.Math.Between(88, 118));
    enemy.body?.setCircle(isElite ? 16 : 13, isElite ? 2 : 3, isElite ? 2 : 3);
    this.enemies.add(enemy);
  }

  private fireAtNearestEnemy() {
    const enemies = this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[];
    const target = enemies
      .filter((enemy) => enemy.active)
      .sort((a, b) => {
        const distanceA = Phaser.Math.Distance.Squared(
          this.player.x,
          this.player.y,
          a.x,
          a.y,
        );
        const distanceB = Phaser.Math.Distance.Squared(
          this.player.x,
          this.player.y,
          b.x,
          b.y,
        );
        return distanceA - distanceB;
      })[0];

    if (!target) {
      return;
    }

    const baseAngle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      target.x,
      target.y,
    );
    const spread = Phaser.Math.DegToRad(10);
    const startOffset = -((this.bulletCount - 1) * spread) / 2;

    for (let i = 0; i < this.bulletCount; i += 1) {
      const angle = baseAngle + startOffset + i * spread;
      const bullet = this.physics.add.sprite(
        this.player.x,
        this.player.y,
        "bullet",
      );
      bullet.setDepth(16);
      bullet.setData("damage", this.bulletDamage);
      bullet.body?.setCircle(6, 1, 1);
      this.physics.velocityFromRotation(angle, 470, bullet.body!.velocity);
      this.bullets.add(bullet);
      this.time.delayedCall(1400, () => {
        if (bullet.active) {
          bullet.destroy();
        }
      });
    }
  }

  private handleBulletEnemy(
    bulletObject: ArcadeOverlapObject,
    enemyObject: ArcadeOverlapObject,
  ) {
    const bullet = bulletObject as Phaser.Physics.Arcade.Sprite;
    const enemy = enemyObject as Phaser.Physics.Arcade.Sprite;
    const damage = bullet.getData("damage") as number;
    const nextHealth = (enemy.getData("health") as number) - damage;
    bullet.destroy();

    if (nextHealth <= 0) {
      this.killEnemy(enemy);
      return;
    }

    enemy.setData("health", nextHealth);
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(55, () => {
      if (enemy.active) {
        enemy.clearTint();
      }
    });
  }

  private handlePlayerEnemy(
    _playerObject: ArcadeOverlapObject,
    enemyObject: ArcadeOverlapObject,
  ) {
    if (this.contactCooldown > 0 || this.status !== "running") {
      return;
    }

    const enemy = enemyObject as Phaser.Physics.Arcade.Sprite;
    const damage = enemy.getData("damage") as number;
    this.health = Math.max(0, this.health - damage);
    this.contactCooldown = 650;
    this.player.setTintFill(0xfff2f2);
    this.cameras.main.shake(90, 0.006);

    const angle = Phaser.Math.Angle.Between(
      enemy.x,
      enemy.y,
      this.player.x,
      this.player.y,
    );
    this.physics.velocityFromRotation(angle, 190, enemy.body!.velocity);

    this.time.delayedCall(120, () => {
      if (this.player.active) {
        this.player.clearTint();
      }
    });

    this.emitStats();
    if (this.health <= 0) {
      this.finishGame("lost");
    }
  }

  private handlePlayerGem(
    _playerObject: ArcadeOverlapObject,
    gemObject: ArcadeOverlapObject,
  ) {
    const gem = gemObject as Phaser.Physics.Arcade.Sprite;
    const xpValue = gem.getData("xp") as number;
    gem.destroy();
    this.addExperience(xpValue);
  }

  private killEnemy(enemy: Phaser.Physics.Arcade.Sprite) {
    const xpValue = enemy.getData("xp") as number;
    const scoreValue = enemy.getData("value") as number;
    const gem = this.physics.add.sprite(enemy.x, enemy.y, "gem");
    gem.setDepth(10);
    gem.setData("xp", xpValue);
    gem.body?.setCircle(7, 1, 1);
    this.gems.add(gem);

    this.kills += 1;
    this.score += scoreValue;
    enemy.destroy();
    this.emitStats();
  }

  private addExperience(value: number) {
    this.xp += value;
    if (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = Math.floor(this.xpToNext * 1.28 + 3);
      this.requestUpgrade();
      return;
    }
    this.emitStats();
  }

  private requestUpgrade() {
    this.status = "choosing";
    this.physics.pause();
    this.emitStats();
    this.callbacks.onUpgrade(this.pickUpgradeOptions());
  }

  private pickUpgradeOptions() {
    const shuffled = Phaser.Utils.Array.Shuffle([...UPGRADE_POOL]);
    return shuffled.slice(0, 3);
  }

  private finishGame(outcome: "won" | "lost") {
    if (this.status === "won" || this.status === "lost") {
      return;
    }

    this.status = outcome;
    this.physics.pause();
    this.emitStats();
    this.callbacks.onResult({
      outcome,
      kills: this.kills,
      score: this.score,
      level: this.level,
      survivedSeconds: Math.min(SURVIVAL_GOAL, Math.floor(this.elapsedSeconds)),
    });
  }

  private emitStats() {
    this.callbacks.onStats({
      status: this.status,
      health: this.health,
      maxHealth: this.maxHealth,
      level: this.level,
      xp: this.xp,
      xpToNext: this.xpToNext,
      kills: this.kills,
      score: this.score,
      timeLeft: Math.max(0, SURVIVAL_GOAL - Math.floor(this.elapsedSeconds)),
      survivalGoal: SURVIVAL_GOAL,
      damage: this.bulletDamage,
      bulletCount: this.bulletCount,
      fireDelay: this.fireDelay,
      speed: this.playerSpeed,
    });
  }
}
