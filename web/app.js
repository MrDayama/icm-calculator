/** 
 * ICM Calculator & Range Analyzer (Corrected Prize EV Edition v1.0.4)
 */

const RANKS = 'AKQJT98765432';
let villainSelectedHands = new Set();

function getCombos(hand) {
    if (hand.length === 2) return 6;
    if (hand.endsWith('s')) return 4;
    return 12;
}

function updateVillainRangeStats() {
    let totalCombos = 0;
    villainSelectedHands.forEach(hand => { totalCombos += getCombos(hand); });
    const pct = ((totalCombos / 1326) * 100).toFixed(1);
    const disp = document.getElementById('villain-range-display');
    const cDisp = document.getElementById('villain-combos-display');
    if (disp) disp.innerText = `${pct}%`;
    if (cDisp) cDisp.innerText = totalCombos;
    return parseFloat(pct);
}

/**
 * 【修正】真のICM計算エンジン
 * チップ量を順位確率に変換し、賞金額を掛けて「賞金期待値(Prize EV)」を算出
 */
function calculateICM(stacks, payouts) {
    const n = stacks.length;
    const actualPayouts = payouts.slice(0, n);
    const fullPayouts = [...actualPayouts, ...new Array(Math.max(0, n - actualPayouts.length)).fill(0)];
    
    // 【修正】BB正規化 (BB=100として正規化)
    const normalizedStacks = stacks.map(s => s / 100.0);
    const cache = new Map();

    function computePrizeEVs(playerIndices, payoutIdx) {
        const sortedIndices = [...playerIndices].sort((a, b) => a - b);
        const key = sortedIndices.join(',') + '|' + payoutIdx;
        if (cache.has(key)) return cache.get(key);

        const numPlayers = playerIndices.length;
        if (numPlayers === 0 || payoutIdx >= fullPayouts.length) {
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

        const subsetTotal = playerIndices.reduce((s, i) => s + (normalizedStacks[i] || 0), 0);
        const currentEVs = {};
        playerIndices.forEach(idx => currentEVs[idx] = 0);

        if (subsetTotal <= 0) {
            let sum = 0;
            for (let i = payoutIdx; i < fullPayouts.length; i++) sum += fullPayouts[i];
            const share = sum / numPlayers;
            playerIndices.forEach(idx => currentEVs[idx] = share);
            return currentEVs;
        }

        const currentPrizeValue = fullPayouts[payoutIdx] || 0;
        playerIndices.forEach(p => {
            // チップ比率からこの順位を獲得する確率を算出
            const probWinsThisPlace = (normalizedStacks[p] || 0) / subsetTotal;
            const remainingPlayers = playerIndices.filter(i => i !== p);
            const subRes = computePrizeEVs(remainingPlayers, payoutIdx + 1);
            
            // プレイヤーp自身の現在の順位賞金EVを加算
            currentEVs[p] += probWinsThisPlace * currentPrizeValue;
            
            // pがこの順位を確定させた場合の、他プレイヤーの事後的EVを合算
            for (const q in subRes) {
                currentEVs[q] += probWinsThisPlace * subRes[q];
            }
        });

        cache.set(key, currentEVs);
        return currentEVs;
    }

    const allIndices = Array.from({length: n}, (_, i) => i);
    const resultDict = computePrizeEVs(allIndices, 0);
    return allIndices.map(i => resultDict[i] || 0);
}

function getEquity(hand, vRangePct) {
    const r1 = hand[0], r2 = hand[1];
    const v1 = RANKS.indexOf(r1), v2 = RANKS.indexOf(r2);
    if (v1 === -1 || v2 === -1) return 0.5;
    const isPair = r1 === r2, isSuited = hand.endsWith('s');
    let basePower = isPair ? 0.5 + ((12 - v1) / 12) * 0.35 : 0.3 + ((12 - v1) / 12) * 0.2 + ((12 - v2) / 12) * 0.15;
    if (isSuited) basePower += 0.04;
    const tightness = 1.0 - (Math.max(1, vRangePct) / 100);
    return Math.max(0.05, Math.min(0.95, basePower - (tightness * 0.2)));
}

document.addEventListener('DOMContentLoaded', () => {
    let mode = 'icm';
    const elements = {
        payoutList: document.getElementById('payout-list'),
        playerList: document.getElementById('player-list'),
        rangeSettings: document.getElementById('range-settings-section'),
        playersSection: document.getElementById('players-section'),
        resultsDisplay: document.getElementById('results-display'),
        heatmapSection: document.getElementById('heatmap-section'),
        heatmapGrid: document.getElementById('heatmap-grid'),
        vGrid: document.getElementById('villain-heatmap-grid'),
        heroSelect: document.getElementById('hero-select'),
        villainSelect: document.getElementById('villain-select'),
        calcBtn: document.getElementById('calc-btn'),
        modeIcm: document.getElementById('mode-icm'),
        modeRange: document.getElementById('mode-range'),
        reqEquity: document.getElementById('req-equity-display')
    };

    function updateSelectionPool() {
        if (!elements.heroSelect || !elements.villainSelect) return;
        const currentH = elements.heroSelect.value, currentV = elements.villainSelect.value;
        const playerInputs = document.querySelectorAll('.player-name');
        elements.heroSelect.innerHTML = ''; elements.villainSelect.innerHTML = '';
        playerInputs.forEach((inp, i) => {
            const name = inp.value || `Player ${i+1}`;
            elements.heroSelect.add(new Option(name, i));
            elements.villainSelect.add(new Option(name, i));
        });
        if (currentH && elements.heroSelect.options[currentH]) elements.heroSelect.value = currentH;
        if (currentV && elements.villainSelect.options[currentV]) elements.villainSelect.value = currentV;
        else if (elements.villainSelect.options.length > 1) elements.villainSelect.selectedIndex = 1;
    }

    function updateMode() {
        if (mode === 'icm') {
            elements.playersSection.classList.remove('hidden');
            elements.rangeSettings.classList.add('hidden');
            elements.resultsDisplay.classList.add('hidden');
            elements.heatmapSection.classList.add('hidden');
        } else {
            elements.rangeSettings.classList.remove('hidden');
            elements.resultsDisplay.classList.add('hidden');
            elements.heatmapSection.classList.add('hidden');
            updateSelectionPool();
        }
    }

    elements.modeIcm.onclick = () => { mode = 'icm'; elements.modeIcm.classList.add('active'); elements.modeRange.classList.remove('active'); updateMode(); };
    elements.modeRange.onclick = () => { mode = 'range'; elements.modeRange.classList.add('active'); elements.modeIcm.classList.remove('active'); updateMode(); };

    function createRow(list, isPlayer = false, val = "") {
        const div = document.createElement('div');
        div.className = 'input-row';
        if (isPlayer) {
            div.style.gridTemplateColumns = '1fr 100px 40px';
            div.innerHTML = `<input type="text" class="player-name" value="${val || ''}" placeholder="Name"><input type="number" class="player-stack" placeholder="Stack" step="any"><button class="btn-remove">×</button>`;
            div.querySelector('.player-name').oninput = updateSelectionPool;
        } else {
            div.innerHTML = `<label>賞金</label><input type="number" class="payout-input" value="${val || ''}" placeholder="Value" step="any"><button class="btn-remove">×</button>`;
        }
        div.querySelector('.btn-remove').onclick = () => { div.remove(); updateSelectionPool(); };
        list.appendChild(div);
    }

    document.getElementById('add-payout').onclick = () => createRow(elements.payoutList);
    document.getElementById('add-player').onclick = () => { createRow(elements.playerList, true); updateSelectionPool(); };

    function initVillainBoard() {
        if (!elements.vGrid) return;
        elements.vGrid.innerHTML = '';
        for (let i = 0; i < 13; i++) {
            for (let j = 0; j < 13; j++) {
                const r1 = RANKS[i], r2 = RANKS[j], h = i === j ? r1+r1 : (i < j ? r1+r2+'s' : r2+r1+'o');
                const cell = document.createElement('div');
                cell.className = 'hand-cell'; cell.innerText = h;
                cell.onclick = () => {
                    if (villainSelectedHands.has(h)) { villainSelectedHands.delete(h); cell.classList.remove('selected'); }
                    else { villainSelectedHands.add(h); cell.classList.add('selected'); }
                    updateVillainRangeStats();
                };
                if (['AA','KK','QQ','JJ','TT','AKs','AQs','AKo'].includes(h)) { villainSelectedHands.add(h); cell.classList.add('selected'); }
                elements.vGrid.appendChild(cell);
            }
        }
        updateVillainRangeStats();
    }

    [50, 30, 20].forEach(v => createRow(elements.payoutList, false, v));
    [10000, 8000, 5000, 3000, 2000].forEach((s, idx) => {
        const div = document.createElement('div'); div.className = 'input-row'; div.style.gridTemplateColumns = '1fr 100px 40px';
        div.innerHTML = `<input type="text" class="player-name" value="Player ${idx+1}"><input type="number" class="player-stack" value="${s}"><button class="btn-remove">×</button>`;
        div.querySelector('.player-name').oninput = updateSelectionPool;
        div.querySelector('.btn-remove').onclick = () => { div.remove(); updateSelectionPool(); };
        elements.playerList.appendChild(div);
    });

    initVillainBoard();
    updateSelectionPool();

    elements.calcBtn.onclick = () => {
        try {
            const p = Array.from(document.querySelectorAll('.payout-input')).map(i => parseFloat(i.value) || 0);
            const s = Array.from(document.querySelectorAll('.player-stack')).map(i => parseFloat(i.value) || 0);
            const names = Array.from(document.querySelectorAll('.player-name')).map((v, i) => v.value || `P${i+1}`);

            if (mode === 'icm') {
                const prizeEVs = calculateICM(s, p);
                elements.resultsDisplay.innerHTML = '<h2>計算結果 (Prize EV)</h2><div class="result-cards"></div>';
                prizeEVs.forEach((ev, i) => {
                    const c = document.createElement('div'); c.className = 'res-card';
                    c.innerHTML = `<div><div class="res-player">${names[i]}</div></div><div class="res-ev">${ev.toFixed(2)}</div>`;
                    elements.resultsDisplay.querySelector('.result-cards').appendChild(c);
                });
                elements.resultsDisplay.classList.remove('hidden');
                elements.heatmapSection.classList.add('hidden');
            } else {
                const hIdx = parseInt(elements.heroSelect.value), vIdx = parseInt(elements.villainSelect.value);
                if (hIdx === vIdx) return alert("別のプレイヤーを選んでください");

                const vPct = updateVillainRangeStats();
                const effectiveStack = Math.min(s[hIdx], s[vIdx]);

                // 1. Fold Scenario (Prize EV)
                const evFold = calculateICM(s, p)[hIdx];
                
                // 2. Win Scenario (Prize EV)
                const ws = [...s]; ws[hIdx] += effectiveStack; ws[vIdx] -= effectiveStack;
                const evWin = calculateICM(ws, p)[hIdx];
                
                // 3. Lose Scenario (Prize EV)
                const ls = [...s]; ls[hIdx] -= effectiveStack; ls[vIdx] += effectiveStack;
                const evLose = calculateICM(ls, p)[hIdx];

                // 【修正】賞金期待値の差分から正しく必要勝率(ICM Equity)を計算
                const den = (evWin - evLose);
                const pReq = den <= 0 ? 1.0 : (evFold - evLose) / den;
                
                elements.reqEquity.innerText = `Req. Equity: ${(pReq * 100).toFixed(1)}%`;

                elements.heatmapGrid.innerHTML = '';
                for (let i = 0; i < 13; i++) {
                    for (let j = 0; j < 13; j++) {
                        const r1 = RANKS[i], r2 = RANKS[j], h = i === j ? r1+r1 : (i < j ? r1+r2+'s' : r2+r1+'o');
                        const isC = getEquity(h, vPct) >= pReq;
                        const cell = document.createElement('div'); cell.className = `hand-cell ${isC ? 'call' : 'fold'}`; cell.innerText = h;
                        elements.heatmapGrid.appendChild(cell);
                    }
                }
                elements.heatmapSection.classList.remove('hidden');
                elements.resultsDisplay.classList.add('hidden');
                elements.heatmapSection.scrollIntoView({ behavior: 'smooth' });
            }
        } catch (err) { alert("エラーが発生しました。"); console.error(err); }
    };
});
