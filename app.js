/** 
 * ICM Calculator & Range Analyzer (Robust Version)
 */

const RANKS = 'AKQJT98765432';

// --- ICM Engine ---
function calculateICM(stacks, payouts) {
    const n = stacks.length;
    const m = payouts.length;
    // プレイヤー数に合わせて賞金リストを調整（多すぎる賞金はカット）
    const actualPayouts = payouts.slice(0, n);
    const fullPayouts = [...actualPayouts, ...new Array(Math.max(0, n - actualPayouts.length)).fill(0)];
    
    const cache = new Map();

    function computeEVs(playerIndices, payoutIdx) {
        // キャッシュキーの生成（インデックスをソートして一意にする）
        const sortedIndices = [...playerIndices].sort((a, b) => a - b);
        const key = sortedIndices.join(',') + '|' + payoutIdx;
        if (cache.has(key)) return cache.get(key);

        const numPlayers = playerIndices.length;
        if (numPlayers === 0) return {};
        
        // 賞金がもうない場合
        if (payoutIdx >= fullPayouts.length) {
            const res = {};
            playerIndices.forEach(idx => res[idx] = 0);
            return res;
        }

        // 最後の一人の場合
        if (numPlayers === 1) {
            const idx = playerIndices[0];
            let sum = 0;
            for (let i = payoutIdx; i < fullPayouts.length; i++) sum += fullPayouts[i];
            return { [idx]: sum };
        }

        const subsetTotal = playerIndices.reduce((s, i) => s + (stacks[i] || 0), 0);
        const currentEVs = {};
        playerIndices.forEach(idx => currentEVs[idx] = 0);

        if (subsetTotal === 0) {
            let sum = 0;
            for (let i = payoutIdx; i < fullPayouts.length; i++) sum += fullPayouts[i];
            const share = sum / numPlayers;
            playerIndices.forEach(idx => currentEVs[idx] = share);
            return currentEVs;
        }

        const currentPrize = fullPayouts[payoutIdx] || 0;
        playerIndices.forEach(p => {
            const prob = (stacks[p] || 0) / subsetTotal;
            const remaining = playerIndices.filter(i => i !== p);
            const subRes = computeEVs(remaining, payoutIdx + 1);
            currentEVs[p] += prob * currentPrize;
            for (const q in subRes) {
                currentEVs[q] += prob * subRes[q];
            }
        });

        cache.set(key, currentEVs);
        return currentEVs;
    }

    const allIndices = Array.from({length: n}, (_, i) => i);
    const resultDict = computeEVs(allIndices, 0);
    return allIndices.map(i => resultDict[i] || 0);
}

// --- Range Logic ---
function getEquity(hand, vRangePct) {
    const r1 = hand[0];
    const r2 = hand[1];
    const v1 = RANKS.indexOf(r1);
    const v2 = RANKS.indexOf(r2);
    const isPair = r1 === r2;
    const isSuited = hand.endsWith('s');

    let power;
    if (isPair) {
        power = 0.5 + ((12 - v1) / 12) * 0.35;
    } else {
        power = 0.3 + ((12 - v1) / 12) * 0.2 + ((12 - v2) / 12) * 0.1;
        if (isSuited) power += 0.04;
    }

    const tightness = 1.0 - (vRangePct / 100);
    return Math.max(0.1, Math.min(0.9, power - (tightness * 0.22)));
}

// --- UI Management ---
document.addEventListener('DOMContentLoaded', () => {
    let mode = 'icm';
    const payoutList = document.getElementById('payout-list');
    const playerList = document.getElementById('player-list');
    const playerSection = document.getElementById('players-section');
    const rangeSettings = document.getElementById('range-settings-section');
    const resultsDisplay = document.getElementById('results-display');
    const heatmapSection = document.getElementById('heatmap-section');
    const heatmapGrid = document.getElementById('heatmap-grid');
    const heroSelect = document.getElementById('hero-select');
    const villainSelect = document.getElementById('villain-select');

    function updateMode() {
        if (mode === 'icm') {
            playerSection.classList.remove('hidden');
            rangeSettings.classList.add('hidden');
            resultsDisplay.classList.add('hidden');
            heatmapSection.classList.add('hidden');
        } else {
            playerSection.classList.remove('hidden');
            rangeSettings.classList.remove('hidden');
            resultsDisplay.classList.add('hidden');
            heatmapSection.classList.add('hidden');
            updateSelectionPool();
        }
    }

    document.getElementById('mode-icm').onclick = () => {
        mode = 'icm';
        document.getElementById('mode-icm').classList.add('active');
        document.getElementById('mode-range').classList.remove('active');
        updateMode();
    };
    document.getElementById('mode-range').onclick = () => {
        mode = 'range';
        document.getElementById('mode-range').classList.add('active');
        document.getElementById('mode-icm').classList.remove('active');
        updateMode();
    };

    function updateSelectionPool() {
        const playerInputs = document.querySelectorAll('.player-name');
        const currentHero = heroSelect.value;
        const currentVillain = villainSelect.value;
        
        heroSelect.innerHTML = '';
        villainSelect.innerHTML = '';
        
        playerInputs.forEach((input, i) => {
            const name = input.value || `Player ${i+1}`;
            heroSelect.add(new Option(name, i));
            villainSelect.add(new Option(name, i));
        });

        // 選択状態の復元
        if (currentHero && heroSelect.options[currentHero]) heroSelect.value = currentHero;
        if (currentVillain && villainSelect.options[currentVillain]) villainSelect.value = currentVillain;
        else if (villainSelect.options.length > 1 && !villainSelect.value) villainSelect.selectedIndex = 1;
    }

    function createRow(list, type) {
        const div = document.createElement('div');
        div.className = 'input-row';
        if (type === 'player') {
            div.style.gridTemplateColumns = '1fr 100px 40px';
            div.innerHTML = `<input type="text" class="player-name" placeholder="Name"><input type="number" class="player-stack" placeholder="Stack" step="any"><button class="btn-remove">×</button>`;
        } else {
            div.innerHTML = `<label>賞金</label><input type="number" class="payout-input" placeholder="Value" step="any"><button class="btn-remove">×</button>`;
        }
        div.querySelector('.btn-remove').onclick = () => {
            div.remove();
            if (mode === 'range') updateSelectionPool();
        };
        // 入力変更時にもプールを更新
        if (type === 'player') {
            div.querySelector('.player-name').oninput = () => { if (mode === 'range') updateSelectionPool(); };
        }
        list.appendChild(div);
    }

    document.getElementById('add-payout').onclick = () => createRow(payoutList, 'payout');
    document.getElementById('add-player').onclick = () => {
        createRow(playerList, 'player');
        if (mode === 'range') updateSelectionPool();
    };

    // 初期化デモデータ
    const defaultPayouts = [50, 30, 20];
    const defaultStacks = [10000, 8000, 5000, 3000, 2000];

    defaultPayouts.forEach(v => {
        const div = document.createElement('div');
        div.className = 'input-row';
        div.innerHTML = `<label>賞金</label><input type="number" class="payout-input" value="${v}"><button class="btn-remove">×</button>`;
        div.querySelector('.btn-remove').onclick = () => div.remove();
        payoutList.appendChild(div);
    });

    defaultStacks.forEach((s, idx) => {
        const div = document.createElement('div');
        div.className = 'input-row';
        div.style.gridTemplateColumns = '1fr 100px 40px';
        div.innerHTML = `<input type="text" class="player-name" value="Player ${idx+1}"><input type="number" class="player-stack" value="${s}"><button class="btn-remove">×</button>`;
        div.querySelector('.btn-remove').onclick = () => { div.remove(); updateSelectionPool(); };
        div.querySelector('.player-name').oninput = () => updateSelectionPool();
        playerList.appendChild(div);
    });

    updateSelectionPool();

    document.getElementById('calc-btn').onclick = () => {
        try {
            const payouts = Array.from(document.querySelectorAll('.payout-input')).map(i => parseFloat(i.value) || 0);
            const stacks = Array.from(document.querySelectorAll('.player-stack')).map(i => parseFloat(i.value) || 0);
            const names = Array.from(document.querySelectorAll('.player-name')).map((i, idx) => i.value || `Player ${idx+1}`);

            if (stacks.length === 0 || payouts.length === 0) {
                alert("スタックと賞金を入力してください。");
                return;
            }

            if (mode === 'icm') {
                const evs = calculateICM(stacks, payouts);
                resultsDisplay.innerHTML = '<h2>計算結果 (EV)</h2><div class="result-cards"></div>';
                const cardList = resultsDisplay.querySelector('.result-cards');
                evs.forEach((ev, idx) => {
                    const card = document.createElement('div');
                    card.className = 'res-card';
                    card.innerHTML = `<div><div class="res-player">${names[idx]}</div></div><div class="res-ev">${ev.toFixed(2)}</div>`;
                    cardList.appendChild(card);
                });
                resultsDisplay.classList.remove('hidden');
                heatmapSection.classList.add('hidden');
            } else {
                const hIdx = parseInt(heroSelect.value);
                const vIdx = parseInt(villainSelect.value);
                const vPct = parseFloat(document.getElementById('villain-range-pct').value) || 30;

                if (hIdx === vIdx) {
                    alert("HeroとVillainは別のプレイヤーを選択してください。");
                    return;
                }

                const evFold = calculateICM(stacks, payouts)[hIdx];
                const winAmt = Math.min(stacks[hIdx], stacks[vIdx]);
                
                const wStacks = [...stacks]; wStacks[hIdx] += winAmt; wStacks[vIdx] -= winAmt;
                const evWin = calculateICM(wStacks, payouts)[hIdx];
                
                const lStacks = [...stacks]; lStacks[hIdx] -= winAmt; lStacks[vIdx] += winAmt;
                const evLose = calculateICM(lStacks, payouts)[hIdx];

                const reqEquity = (evFold - evLose) / (evWin - evLose);
                document.getElementById('req-equity-display').innerText = `Req. Equity: ${(reqEquity*100).toFixed(1)}%`;

                heatmapGrid.innerHTML = '';
                for (let i = 0; i < 13; i++) {
                    for (let j = 0; j < 13; j++) {
                        const r1 = RANKS[i], r2 = RANKS[j];
                        const hand = i === j ? r1 + r2 : (i < j ? r1 + r2 + 's' : r2 + r1 + 'o');
                        const eq = getEquity(hand, vPct);
                        const isCall = eq >= reqEquity;
                        const cell = document.createElement('div');
                        cell.className = `hand-cell ${isCall ? 'call' : 'fold'}`;
                        cell.innerText = hand;
                        heatmapGrid.appendChild(cell);
                    }
                }
                heatmapSection.classList.remove('hidden');
                resultsDisplay.classList.add('hidden');
                heatmapSection.scrollIntoView({ behavior: 'smooth' });
            }
        } catch (e) {
            console.error(e);
            alert("計算中にエラーが発生しました。入力を確認してください。");
        }
    };
});
