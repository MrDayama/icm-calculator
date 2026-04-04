/** 
 * ICM Calculator & Range Analyzer (Stability Optimized v1.0.6)
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
 * 修正済みICM計算エンジン (Prize EV算出)
 */
function calculateICM(stacks, payouts) {
    const n = stacks.length;
    if (n === 0) return [];
    
    // 賞金リストの調整
    const actualPayouts = payouts.slice(0, n);
    const fullPayouts = [...actualPayouts, ...new Array(Math.max(0, n - actualPayouts.length)).fill(0)];
    
    // BB正規化 (内部的な計算安定化のため)
    const normStacks = stacks.map(s => Math.max(0, parseFloat(s) || 0) / 10.0);
    const cache = new Map();

    function computePrizeEVs(playerIndices, payoutIdx) {
        const sortedIndices = [...playerIndices].sort((a, b) => a - b);
        const key = sortedIndices.join(',') + '|' + payoutIdx;
        if (cache.has(key)) return cache.get(key);

        const currentNumPlayers = playerIndices.length;
        if (currentNumPlayers === 0 || payoutIdx >= n) return {};

        if (currentNumPlayers === 1) {
            const idx = playerIndices[0];
            let sum = 0;
            for (let i = payoutIdx; i < fullPayouts.length; i++) sum += (fullPayouts[i] || 0);
            return { [idx]: sum };
        }

        const subsetTotal = playerIndices.reduce((s, i) => s + (normStacks[i] || 0), 0);
        const evs = {};
        playerIndices.forEach(idx => evs[idx] = 0);

        if (subsetTotal <= 0) {
            let sum = 0;
            for (let i = payoutIdx; i < fullPayouts.length; i++) sum += (fullPayouts[i] || 0);
            const share = sum / currentNumPlayers;
            playerIndices.forEach(idx => evs[idx] = share);
            return evs;
        }

        const currentPrizeValue = fullPayouts[payoutIdx] || 0;
        playerIndices.forEach(p => {
            const probWinsThisPlace = (normStacks[p] || 0) / subsetTotal;
            const remainingPlayers = playerIndices.filter(i => i !== p);
            const subRes = computePrizeEVs(remainingPlayers, payoutIdx + 1);
            
            evs[p] += probWinsThisPlace * currentPrizeValue;
            for (const q in subRes) {
                evs[q] += probWinsThisPlace * subRes[q];
            }
        });

        cache.set(key, evs);
        return evs;
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
    let currentMode = 'icm';
    const elements = {
        payoutList: document.getElementById('payout-list'),
        playerList: document.getElementById('player-list'),
        rangeSettings: document.getElementById('range-settings-section'),
        playersSection: document.getElementById('players-section'),
        resultsDisplay: document.getElementById('results-display'),
        resultCards: document.getElementById('result-list'), 
        heatmapSection: document.getElementById('heatmap-section'),
        heatmapGrid: document.getElementById('heatmap-grid'),
        vGrid: document.getElementById('villain-heatmap-grid'),
        heroSelect: document.getElementById('hero-select'),
        villainSelect: document.getElementById('villain-select'),
        calcBtn: document.getElementById('calc-btn'),
        modeIcm: document.getElementById('mode-icm'),
        modeRange: document.getElementById('mode-range'),
        reqEquity: document.getElementById('req-equity-display'),
        totalPayoutDisp: document.getElementById('total-payout-display')
    };

    function updateSelectionPool() {
        if (!elements.heroSelect || !elements.villainSelect) return;
        const currentH = elements.heroSelect.value, currentV = elements.villainSelect.value;
        const names = Array.from(document.querySelectorAll('.player-name')).map((inp, i) => inp.value || `Player ${i+1}`);
        elements.heroSelect.innerHTML = ''; elements.villainSelect.innerHTML = '';
        names.forEach((name, i) => {
            elements.heroSelect.add(new Option(name, i));
            elements.villainSelect.add(new Option(name, i));
        });
        if (currentH && elements.heroSelect.options[currentH]) elements.heroSelect.value = currentH;
        if (currentV && elements.villainSelect.options[currentV]) elements.villainSelect.value = currentV;
        else if (elements.villainSelect.options.length > 1) elements.villainSelect.selectedIndex = 1;
    }

    function updateMode() {
        if (currentMode === 'icm') {
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

    elements.modeIcm.onclick = () => { currentMode = 'icm'; elements.modeIcm.classList.add('active'); elements.modeRange.classList.remove('active'); updateMode(); };
    elements.modeRange.onclick = () => { currentMode = 'range'; elements.modeRange.classList.add('active'); elements.modeIcm.classList.remove('active'); updateMode(); };

    function createRow(list, type, val = "", stackVal = "") {
        const div = document.createElement('div');
        div.className = 'input-row';
        if (type === 'player') {
            div.style.gridTemplateColumns = '1fr 100px 40px';
            div.innerHTML = `<input type="text" class="player-name" value="${val}" placeholder="Name"><input type="number" class="player-stack" value="${stackVal}" placeholder="Stack (BB)" step="any"><button class="btn-remove">×</button>`;
            div.querySelector('.player-name').oninput = updateSelectionPool;
        } else {
            div.innerHTML = `<label>賞金</label><input type="number" class="payout-input" value="${val}" placeholder="Value" step="any"><button class="btn-remove">×</button>`;
        }
        div.querySelector('.btn-remove').onclick = () => { div.remove(); updateSelectionPool(); };
        list.appendChild(div);
    }

    document.getElementById('add-payout').onclick = () => createRow(elements.payoutList, 'payout');
    document.getElementById('add-player').onclick = () => { createRow(elements.playerList, 'player'); updateSelectionPool(); };

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
                if (['AA','KK','QQ','JJ','TT','AKs','AQs','AKo','AJs'].includes(h)) { villainSelectedHands.add(h); cell.classList.add('selected'); }
                elements.vGrid.appendChild(cell);
            }
        }
        updateVillainRangeStats();
    }

    // 初回ロード
    [50, 30, 20].forEach(v => createRow(elements.payoutList, 'payout', v));
    [100, 80, 50, 30, 20].forEach((s, idx) => createRow(elements.playerList, 'player', `Player ${idx+1}`, s));
    initVillainBoard();
    updateSelectionPool();

    elements.calcBtn.onclick = () => {
        try {
            const p = Array.from(document.querySelectorAll('.payout-input')).map(i => parseFloat(i.value) || 0);
            const s = Array.from(document.querySelectorAll('.player-stack')).map(i => parseFloat(i.value) || 0);
            const names = Array.from(document.querySelectorAll('.player-name')).map((v, i) => v.value || `P${i+1}`);

            if (p.length === 0 || s.length === 0) throw new Error("スタックと賞金を入力してください。");

            if (currentMode === 'icm') {
                const results = calculateICM(s, p);
                elements.resultCards.innerHTML = '';
                let total = 0;
                results.forEach((ev, i) => {
                    const c = document.createElement('div'); c.className = 'res-card';
                    c.innerHTML = `<div><div class="res-player">${names[i]}</div></div><div class="res-ev">${ev.toFixed(2)}</div>`;
                    elements.resultCards.appendChild(c);
                    total += ev;
                });
                if (elements.totalPayoutDisp) elements.totalPayoutDisp.innerText = total.toFixed(1);
                elements.resultsDisplay.classList.remove('hidden');
                elements.heatmapSection.classList.add('hidden');
            } else {
                const hIdx = parseInt(elements.heroSelect.value), vIdx = parseInt(elements.villainSelect.value);
                if (hIdx === vIdx) throw new Error("HeroとVillainは別の人を選択してください。");

                const vPct = updateVillainRangeStats();
                const risk = Math.min(s[hIdx], s[vIdx]);

                const evFold = calculateICM(s, p)[hIdx];
                const ws = [...s]; ws[hIdx] += risk; ws[vIdx] -= risk; const evWin = calculateICM(ws, p)[hIdx];
                const ls = [...s]; ls[hIdx] -= risk; ls[vIdx] += risk; const evLose = calculateICM(ls, p)[hIdx];

                const d = evWin - evLose;
                const pReq = d <= 0 ? 1.0 : (evFold - evLose) / d;
                
                elements.reqEquity.innerText = `Req. Equity: ${(pReq * 100).toFixed(1)}%`;
                elements.heatmapGrid.innerHTML = '';
                for (let i = 0; i < 13; i++) {
                    for (let j = 0; j < 13; j++) {
                        const r1 = RANKS[i], r2 = RANKS[j], hand = i === j ? r1+r1 : (i < j ? r1+r2+'s' : r2+r1+'o');
                        const isC = getEquity(hand, vPct) >= pReq;
                        const cell = document.createElement('div'); cell.className = `hand-cell ${isC ? 'call' : 'fold'}`; cell.innerText = hand;
                        elements.heatmapGrid.appendChild(cell);
                    }
                }
                elements.heatmapSection.classList.remove('hidden');
                elements.resultsDisplay.classList.add('hidden');
                elements.heatmapSection.scrollIntoView({ behavior: 'smooth' });
            }
        } catch (err) { alert(err.message); console.error(err); }
    };
});
