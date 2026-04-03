/** 
 * ICM Calculator & Range Analyzer (Interactive Selection)
 */

const RANKS = 'AKQJT98765432';
let villainSelectedHands = new Set(); // Stores strings like 'AA', 'AKs'

// --- Combo Calculation ---
function getCombos(hand) {
    if (hand.length === 2) return 6; // Pair (AA)
    if (hand.endsWith('s')) return 4; // Suited (AKs)
    return 12; // Offsuit (AKo)
}

function updateVillainRangeStats() {
    let totalCombos = 0;
    villainSelectedHands.forEach(hand => {
        totalCombos += getCombos(hand);
    });
    const pct = ((totalCombos / 1326) * 100).toFixed(1);
    document.getElementById('villain-range-display').innerText = `${pct}%`;
    document.getElementById('villain-combos-display').innerText = totalCombos;
    return parseFloat(pct);
}

// --- ICM Engine ---
function calculateICM(stacks, payouts) {
    const n = stacks.length;
    const actualPayouts = payouts.slice(0, n);
    const fullPayouts = [...actualPayouts, ...new Array(Math.max(0, n - actualPayouts.length)).fill(0)];
    const cache = new Map();

    function computeEVs(playerIndices, payoutIdx) {
        const sortedIndices = [...playerIndices].sort((a, b) => a - b);
        const key = sortedIndices.join(',') + '|' + payoutIdx;
        if (cache.has(key)) return cache.get(key);

        const numPlayers = playerIndices.length;
        if (numPlayers === 0) return {};
        if (payoutIdx >= fullPayouts.length) {
            const res = {};
            playerIndices.forEach(idx => res[idx] = 0);
            return res;
        }
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
            for (const q in subRes) currentEVs[q] += prob * subRes[q];
        });

        cache.set(key, currentEVs);
        return currentEVs;
    }

    const allIndices = Array.from({length: n}, (_, i) => i);
    const resultDict = computeEVs(allIndices, 0);
    return allIndices.map(i => resultDict[i] || 0);
}

// --- Equity Logic ---
function getEquity(hand, vRangePct) {
    const r1 = hand[0], r2 = hand[1];
    const v1 = RANKS.indexOf(r1), v2 = RANKS.indexOf(r2);
    const isPair = r1 === r2, isSuited = hand.endsWith('s');
    let power = isPair ? 0.5 + ((12 - v1) / 12) * 0.35 : 0.3 + ((12 - v1) / 12) * 0.2 + ((12 - v2) / 12) * 0.1;
    if (isSuited) power += 0.04;
    const tightness = 1.0 - (Math.max(1, vRangePct) / 100);
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
    const villainHeatmapGrid = document.getElementById('villain-heatmap-grid');
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
        const currentHero = heroSelect.value, currentVillain = villainSelect.value;
        heroSelect.innerHTML = ''; villainSelect.innerHTML = '';
        playerInputs.forEach((input, i) => {
            const name = input.value || `Player ${i+1}`;
            heroSelect.add(new Option(name, i));
            villainSelect.add(new Option(name, i));
        });
        if (currentHero && heroSelect.options[currentHero]) heroSelect.value = currentHero;
        if (currentVillain && villainSelect.options[currentVillain]) villainSelect.value = currentVillain;
        else if (villainSelect.options.length > 1) villainSelect.selectedIndex = 1;
    }

    // --- Villain Range Grid Init ---
    function initVillainGrid() {
        villainHeatmapGrid.innerHTML = '';
        for (let i = 0; i < 13; i++) {
            for (let j = 0; j < 13; j++) {
                const r1 = RANKS[i], r2 = RANKS[j];
                const hand = i === j ? r1 + r2 : (i < j ? r1 + r2 + 's' : r2 + r1 + 'o');
                const cell = document.createElement('div');
                cell.className = 'hand-cell';
                cell.innerText = hand;
                cell.onclick = () => {
                    if (villainSelectedHands.has(hand)) {
                        villainSelectedHands.delete(hand);
                        cell.classList.remove('selected');
                    } else {
                        villainSelectedHands.add(hand);
                        cell.classList.add('selected');
                    }
                    updateVillainRangeStats();
                };
                villainHeatmapGrid.appendChild(cell);
            }
        }
        // Default: Broad range for demo (Pocket pairs, good high cards)
        ['AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', 'AKs', 'AQs', 'AJs', 'KQs', 'AKo', 'AQo'].forEach(h => {
             villainSelectedHands.add(h);
             const cells = Array.from(villainHeatmapGrid.children);
             const cell = cells.find(c => c.innerText === h);
             if (cell) cell.classList.add('selected');
        });
        updateVillainRangeStats();
    }

    initVillainGrid();

    // List Management Helpers
    function createRow(list, type) {
        const div = document.createElement('div');
        div.className = 'input-row';
        if (type === 'player') {
            div.style.gridTemplateColumns = '1fr 100px 40px';
            div.innerHTML = `<input type="text" class="player-name" placeholder="Name"><input type="number" class="player-stack" placeholder="Stack" step="any"><button class="btn-remove">×</button>`;
            div.querySelector('.player-name').oninput = () => { if (mode === 'range') updateSelectionPool(); };
        } else {
            div.innerHTML = `<label>賞金</label><input type="number" class="payout-input" placeholder="Value" step="any"><button class="btn-remove">×</button>`;
        }
        div.querySelector('.btn-remove').onclick = () => { div.remove(); updateSelectionPool(); };
        list.appendChild(div);
    }

    document.getElementById('add-payout').onclick = () => createRow(payoutList, 'payout');
    document.getElementById('add-player').onclick = () => { createRow(playerList, 'player'); updateSelectionPool(); };

    // Initial Data
    [50, 30, 20].forEach(v => {
        const div = document.createElement('div'); div.className = 'input-row';
        div.innerHTML = `<label>賞金</label><input type="number" class="payout-input" value="${v}"><button class="btn-remove">×</button>`;
        div.querySelector('.btn-remove').onclick = () => div.remove();
        payoutList.appendChild(div);
    });
    [10000, 8000, 5000, 3000, 2000].forEach((s, idx) => {
        const div = document.createElement('div'); div.className = 'input-row';
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
            if (stacks.length === 0 || payouts.length === 0) return alert("入力エラー");

            if (mode === 'icm') {
                const evs = calculateICM(stacks, payouts);
                resultsDisplay.innerHTML = '<h2>計算結果 (EV)</h2><div class="result-cards"></div>';
                evs.forEach((ev, idx) => {
                    const card = document.createElement('div'); card.className = 'res-card';
                    card.innerHTML = `<div><div class="res-player">Player ${idx+1}</div></div><div class="res-ev">${ev.toFixed(2)}</div>`;
                    resultsDisplay.querySelector('.result-cards').appendChild(card);
                });
                resultsDisplay.classList.remove('hidden');
                heatmapSection.classList.add('hidden');
            } else {
                const hIdx = parseInt(heroSelect.value), vIdx = parseInt(villainSelect.value);
                if (hIdx === vIdx) return alert("別のプレイヤーを選択してください");

                const vPct = updateVillainRangeStats();
                const evFold = calculateICM(stacks, payouts)[hIdx];
                const winAmt = Math.min(stacks[hIdx], stacks[vIdx]);
                const wS = [...stacks]; wS[hIdx]+=winAmt; wS[vIdx]-=winAmt; const evWin = calculateICM(wS, payouts)[hIdx];
                const lS = [...stacks]; lS[hIdx]-=winAmt; lS[vIdx]+=winAmt; const evLose = calculateICM(lS, payouts)[hIdx];

                const reqEquity = (evFold - evLose) / (evWin - evLose);
                document.getElementById('req-equity-display').innerText = `Req. Equity: ${(reqEquity*100).toFixed(1)}%`;

                heatmapGrid.innerHTML = '';
                for (let i = 0; i < 13; i++) {
                    for (let j = 0; j < 13; j++) {
                        const r1 = RANKS[i], r2 = RANKS[j], h = i === j ? r1 + r2 : (i < j ? r1 + r2 + 's' : r2 + r1 + 'o');
                        const isCall = getEquity(h, vPct) >= reqEquity;
                        const cell = document.createElement('div');
                        cell.className = `hand-cell ${isCall ? 'call' : 'fold'}`;
                        cell.innerText = h;
                        heatmapGrid.appendChild(cell);
                    }
                }
                heatmapSection.classList.remove('hidden');
                resultsDisplay.classList.add('hidden');
                heatmapSection.scrollIntoView({ behavior: 'smooth' });
            }
        } catch (e) { alert("エラーが発生しました。"); }
    };
});
