import Phaser from "phaser";
import {
  Activity,
  Crosshair,
  HeartPulse,
  Play,
  RotateCcw,
  Swords,
  Timer,
  Trophy,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./App.css";
import {
  type GameResult,
  type GameStats,
  SurvivorScene,
  type UpgradeId,
  type UpgradeOption,
} from "./game/SurvivorScene";

const initialStats: GameStats = {
  status: "running",
  health: 100,
  maxHealth: 100,
  level: 1,
  xp: 0,
  xpToNext: 6,
  kills: 0,
  score: 0,
  timeLeft: 90,
  survivalGoal: 90,
  damage: 1,
  bulletCount: 1,
  fireDelay: 520,
  speed: 215,
};

function App() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<SurvivorScene | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [runId, setRunId] = useState(0);
  const [screen, setScreen] = useState<"menu" | "playing" | "ended">("menu");
  const [stats, setStats] = useState<GameStats>(initialStats);
  const [upgradeOptions, setUpgradeOptions] = useState<UpgradeOption[]>([]);
  const [result, setResult] = useState<GameResult | null>(null);

  useEffect(() => {
    if (screen !== "playing" || !containerRef.current) {
      return undefined;
    }

    containerRef.current.innerHTML = "";
    const scene = new SurvivorScene({
      onStats: setStats,
      onUpgrade: setUpgradeOptions,
      onResult: (gameResult) => {
        setResult(gameResult);
        setUpgradeOptions([]);
        window.setTimeout(() => setScreen("ended"), 500);
      },
    });

    sceneRef.current = scene;
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 960,
      height: 540,
      backgroundColor: "#121826",
      scene,
      physics: {
        default: "arcade",
        arcade: {
          debug: false,
        },
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [runId, screen]);

  function startGame() {
    setStats(initialStats);
    setResult(null);
    setUpgradeOptions([]);
    setScreen("playing");
    setRunId((current) => current + 1);
  }

  function chooseUpgrade(id: UpgradeId) {
    sceneRef.current?.applyUpgrade(id);
    setUpgradeOptions([]);
  }

  const healthPercent = Math.round((stats.health / stats.maxHealth) * 100);
  const xpPercent = Math.round((stats.xp / stats.xpToNext) * 100);
  const timePercent = Math.round((stats.timeLeft / stats.survivalGoal) * 100);

  return (
    <main className="app-shell">
      <section className="game-stage" aria-label="Shadow Survivor game">
        <div className="game-topbar">
          <div className="brand">
            <div className="brand-mark">
              <Swords size={26} />
            </div>
            <div>
              <h1>Shadow Survivor</h1>
              <p>2D 生存打怪小游戏</p>
            </div>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={startGame}
            title="重新开始"
            aria-label="重新开始"
          >
            {screen === "menu" ? <Play size={19} /> : <RotateCcw size={19} />}
          </button>
        </div>

        <div className="hud-grid">
          <StatusCard icon={<HeartPulse size={18} />} label="生命">
            <strong>
              {stats.health}/{stats.maxHealth}
            </strong>
            <span className="bar">
              <i style={{ width: `${healthPercent}%` }} />
            </span>
          </StatusCard>
          <StatusCard icon={<Zap size={18} />} label="等级">
            <strong>Lv.{stats.level}</strong>
            <span className="bar xp">
              <i style={{ width: `${xpPercent}%` }} />
            </span>
          </StatusCard>
          <StatusCard icon={<Timer size={18} />} label="剩余">
            <strong>{stats.timeLeft}s</strong>
            <span className="bar time">
              <i style={{ width: `${timePercent}%` }} />
            </span>
          </StatusCard>
          <StatusCard icon={<Crosshair size={18} />} label="击败">
            <strong>{stats.kills}</strong>
            <small>Score {stats.score}</small>
          </StatusCard>
        </div>

        <div className="canvas-frame">
          <div ref={containerRef} className="game-canvas" />

          {screen === "menu" && (
            <div className="overlay-panel menu-panel">
              <h2>Survive the Night</h2>
              <p>
                用 WASD 或方向键移动，角色会自动攻击最近的敌人。收集黄色晶体升级，
                选择技能，尽量存活 90 秒。
              </p>
              <button className="primary-button" type="button" onClick={startGame}>
                <Play size={20} />
                开始游戏
              </button>
            </div>
          )}

          {upgradeOptions.length > 0 && (
            <div className="overlay-panel upgrade-panel">
              <div className="upgrade-heading">
                <Activity size={22} />
                <div>
                  <h2>选择升级</h2>
                  <p>本轮暂停，选择一个能力后继续战斗。</p>
                </div>
              </div>
              <div className="upgrade-grid">
                {upgradeOptions.map((option) => (
                  <button
                    className="upgrade-card"
                    key={option.id}
                    type="button"
                    onClick={() => chooseUpgrade(option.id)}
                  >
                    <strong>{option.title}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {screen === "ended" && result && (
            <div className="overlay-panel result-panel">
              <Trophy size={34} />
              <h2>{result.outcome === "won" ? "生存成功" : "挑战失败"}</h2>
              <p>
                存活 {result.survivedSeconds}s，击败 {result.kills} 个敌人，
                达到 Lv.{result.level}，得分 {result.score}。
              </p>
              <button className="primary-button" type="button" onClick={startGame}>
                <RotateCcw size={20} />
                再来一局
              </button>
            </div>
          )}
        </div>

        <div className="build-notes">
          <div>
            <b>玩法循环</b>
            <span>移动走位，自动攻击，击败怪物，收集经验，升级选技能</span>
          </div>
          <div>
            <b>AI 协作展示</b>
            <span>用 AI 做方案拆解、代码实现、玩法调参、测试清单和文档整理</span>
          </div>
          <div>
            <b>当前能力</b>
            <span>
              伤害 {stats.damage} / 弹体 {stats.bulletCount} / 攻速{" "}
              {Math.round(1000 / stats.fireDelay)} 次每秒 / 速度{" "}
              {Math.round(stats.speed)}
            </span>
          </div>
        </div>
      </section>

      <aside className="side-panel">
        <section>
          <h2>开发规划</h2>
          <ol>
            <li>确定通用生存打怪玩法，避免把 AI 概念硬塞进游戏机制。</li>
            <li>使用 Phaser 实现移动、刷怪、碰撞、自动攻击和经验掉落。</li>
            <li>用 React 承载 HUD、开始/结束状态和升级选择 UI。</li>
            <li>通过参数调试控制难度曲线，保证 1 分钟内能看到升级反馈。</li>
            <li>补充 README，说明这个游戏如何由 AI 协作开发完成。</li>
          </ol>
        </section>
        <section>
          <h2>AI 协作分工</h2>
          <ul>
            <li>Claude：玩法方向、MVP 范围和求职叙事。</li>
            <li>GPT：任务拆解、说明文案和测试清单。</li>
            <li>Gemini：从玩家体验角度做反向评审。</li>
            <li>Codex：本地实现、构建验证和问题修复。</li>
            <li>Claude Code：后续代码结构检查和重构建议。</li>
          </ul>
        </section>
      </aside>
    </main>
  );
}

function StatusCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <article className="status-card">
      <div>
        {icon}
        <span>{label}</span>
      </div>
      {children}
    </article>
  );
}

export default App;
