/** 
 * ICM Calculator & Range Analyzer (Standard White v1.4.0)
 * Corrected BF Math & Layout Fix
 */

const RANKS = 'AKQJT98765432';
let villainSelectedHands = new Set();

function getCombos(hand) {
    if (hand.length === 2) return 6;
    if (hand.endsWith('s')) return 4;
    return 12;
}

function updateStats(handsSet, displayId, comboId) {
    let totalCombos = 0;
    handsSet.forEach(h => { totalCombos += getCombos(h); });
    const pct = ((totalCombos / 1326) * 100).toFixed(1);
    const disp = document.getElementById(displayId);
    const cDisp = document.getElementById(comboId);
    if (disp) disp.innerText = `${pct}%`;
    if (cDisp) cDisp.innerText = totalCombos;
    return parseFloat(pct);
}

// --- ICM Engine ---
function calculateICM(stacks, payouts) {
    const n = stacks.length;
    if (n === 0) return [];
    const actualPayouts = payouts.slice(0, n);
    const fullPayouts = [...actualPayouts, ...new Array(Math.max(0, n - actualPayouts.length)).fill(0)];
    
    // BB正規化
    const normStacks = stacks.map(s => Math.max(0.1, parseFloat(s) || 0) / 10.0);
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
            for (const q in subRes) evs[q] += probWinsThisPlace * subRes[q];
        });

        cache.set(key, evs);
        return evs;
    }

    const allIndices = Array.from({length: n}, (_, i) => i);
    const resultDict = computePrizeEVs(allIndices, 0);
    return allIndices.map(i => resultDict[i] || 0);
}

// --- Precision Equity Model (Category Stats & Blocker) ---
function getPrecisionEquity(heroHandStr, vRangeSet) {
    const r1 = heroHandStr[0], r2 = heroHandStr[1];
    const v1 = RANKS.indexOf(r1), v2 = RANKS.indexOf(r2);
    const isPair = r1 === r2, isSuited = heroHandStr.endsWith('s');
    
    const pairEquities = [85, 82, 80, 77, 75, 72, 70, 67, 65, 62, 60, 57, 55];
    let baseEq = isPair ? pairEquities[v1] / 100 : (45 + (12-v1)*3 + (12-v2)*1.5) / 100;
    if (isSuited) baseEq += 0.04;

    const vRangePct = (vRangeSet.size / 169) * 100;
    let blockerMod = 0;
    if (vRangeSet.size > 0) {
        const topCards = ['A', 'K', 'Q'];
        topCards.forEach(c => { if (heroHandStr.includes(c)) blockerMod += (1.0 - vRangePct/100) * 0.05; });
    }

    const tightnessScaling = (1.0 - (vRangePct / 100)) * 0.40;
    return Math.max(0.02, Math.min(0.99, baseEq - tightnessScaling + blockerMod));
}

function calculateBF(stacks, payouts, heroIdx, villainIdx) {
    if (heroIdx === villainIdx) return 1.0;
    const evsNow = calculateICM(stacks, payouts);
    const evNow = evsNow[heroIdx];
    const risk = Math.min(stacks[heroIdx], stacks[villainIdx]);
    const ws = [...stacks]; ws[heroIdx] += risk; ws[villainIdx] -= risk;
    const evWin = calculateICM(ws, payouts)[heroIdx];
    const ls = [...stacks]; ls[heroIdx] -= risk; ls[villainIdx] += risk;
    const evLose = calculateICM(ls, payouts)[heroIdx];
    
    const reward = evWin - evNow;
    const risk_ev = evNow - evLose;
    if (reward <= 0) return 9.99;
    return risk_ev / reward;
}

function calculateRiskScore(stack, orbitLeft) {
    const blindTotal = 1.5;
    const stackRatio = stack / blindTotal;
    if (stackRatio <= 0) return 999;
    return orbitLeft / stackRatio;
}

// --- UI ---
document.addEventListener('DOMContentLoaded', () => {
    let currentMode = 'icm';
    const elements = {
        payoutList: document.getElementById('payout-list'),
        playerList: document.getElementById('player-list'),
        rangeSettings: document.getElementById('range-settings-section'),
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
        totalPayoutDisp: document.getElementById('total-payout-display'),
        calcSummary: document.getElementById('calculation-summary-area'),
        specificHand: document.getElementById('specific-hand-input')
    };

    function updateSelectionPool() {
        const hVal = elements.heroSelect.value, vVal = elements.villainSelect.value;
        const names = Array.from(document.querySelectorAll('.player-name')).map((inp, i) => inp.value || `Player ${i+1}`);
        elements.heroSelect.innerHTML = ''; elements.villainSelect.innerHTML = '';
        names.forEach((name, i) => {
            elements.heroSelect.add(new Option(name, i));
            elements.villainSelect.add(new Option(name, i));
        });
        if (hVal !== "") elements.heroSelect.value = hVal;
        if (vVal !== "") elements.villainSelect.value = vVal;
    }

    function createRow(list, type, val = "", sVal = "") {
        const div = document.createElement('div');
        div.className = 'input-row';
        if (type === 'player') {
            div.innerHTML = `<input type="text" class="player-name" value="${val}" placeholder="Name"><input type="number" class="player-stack" value="${sVal}" placeholder="BB" step="any"><button class="btn-remove">×</button>`;
            div.querySelector('.player-name').oninput = updateSelectionPool;
        } else {
            div.innerHTML = `<label>賞金</label><input type="number" class="payout-input" value="${val}" placeholder="Value" step="any"><button class="btn-remove">×</button>`;
        }
        div.querySelector('.btn-remove').onclick = () => { div.remove(); updateSelectionPool(); };
        list.appendChild(div);
    }

    elements.modeIcm.onclick = () => { currentMode = 'icm'; elements.modeIcm.classList.add('active'); elements.modeRange.classList.remove('active'); elements.rangeSettings.classList.add('hidden'); };
    elements.modeRange.onclick = () => { currentMode = 'range'; elements.modeRange.classList.add('active'); elements.modeIcm.classList.remove('active'); elements.rangeSettings.classList.remove('hidden'); updateSelectionPool(); };

    document.getElementById('add-payout').onclick = () => createRow(elements.payoutList, 'payout');
    document.getElementById('add-player').onclick = () => { createRow(elements.playerList, 'player'); updateSelectionPool(); };

    function initVillainBoard() {
        elements.vGrid.innerHTML = '';
        for (let i = 0; i < 13; i++) {
            for (let j = 0; j < 13; j++) {
                const r1 = RANKS[i], r2 = RANKS[j], h = i === j ? r1+r1 : (i < j ? r1+r2+'s' : r2+r1+'o');
                const cell = document.createElement('div');
                cell.className = 'hand-cell'; cell.innerText = h;
                cell.onclick = () => {
                    if (villainSelectedHands.has(h)) { villainSelectedHands.delete(h); cell.classList.remove('selected'); }
                    else { villainSelectedHands.add(h); cell.classList.add('selected'); }
                    updateStats(villainSelectedHands, 'villain-range-display', 'villain-combos-display');
                };
                if (['AA','KK','QQ','JJ','TT','AKs','AKo'].includes(h)) { villainSelectedHands.add(h); cell.classList.add('selected'); }
                elements.vGrid.appendChild(cell);
            }
        }
    }

    [50, 30, 20].forEach(v => createRow(elements.payoutList, 'payout', v));
    [100, 80, 50, 30, 20].forEach((s, idx) => createRow(elements.playerList, 'player', `P${idx+1}`, s));
    initVillainBoard(); updateSelectionPool(); updateStats(villainSelectedHands, 'villain-range-display', 'villain-combos-display');

    elements.calcBtn.onclick = () => {
        const p = Array.from(document.querySelectorAll('.payout-input')).map(i => parseFloat(i.value) || 0);
        const s = Array.from(document.querySelectorAll('.player-stack')).map(i => parseFloat(i.value) || 0);
        const names = Array.from(document.querySelectorAll('.player-name')).map((v, i) => v.value || `P${i+1}`);

        if (currentMode === 'icm') {
            const results = calculateICM(s, p);
            elements.resultCards.innerHTML = '';
            results.forEach((ev, i) => {
                const risk = calculateRiskScore(s[i], i+1);
                let bfs = [];
                s.forEach((sj, j) => { if (i !== j && s[i]>0 && s[j]>0) bfs.push({name: names[j], val: calculateBF(s,p,i,j).toFixed(2)}); });
                const row = document.createElement('div'); row.className = 'res-card';
                row.innerHTML = `<div class="res-card-main"><div class="res-player">${names[i]} <span class="avg-bf-tag">Risk: ${risk.toFixed(1)}</span></div><div class="res-ev">${ev.toFixed(2)}</div></div><div class="res-bf-details">${bfs.map(b => `<div class="bf-row">vs ${b.name}: ${b.val}</div>`).join('')}</div>`;
                elements.resultCards.appendChild(row);
            });
            elements.resultsDisplay.classList.remove('hidden');
        } else {
            const hIdx = parseInt(elements.heroSelect.value), vIdx = parseInt(elements.villainSelect.value);
            const risk = Math.min(s[hIdx], s[vIdx]);
            const evFold = calculateICM(s, p)[hIdx];
            const ws = [...s]; ws[hIdx] += risk; ws[vIdx] -= risk; const evWin = calculateICM(ws, p)[hIdx];
            const ls = [...s]; ls[hIdx] -= risk; ls[vIdx] += risk; const evLose = calculateICM(ls, p)[hIdx];
            const pReq = (evFold - evLose) / (evWin - evLose);
            elements.reqEquity.innerText = `Req. Equity: ${(pReq * 100).toFixed(1)}%`;
            elements.heatmapGrid.innerHTML = '';
            for (let i = 0; i < 13; i++) {
                for (let j = 0; j < 13; j++) {
                    const r1 = RANKS[i], r2 = RANKS[j], hand = i === j ? r1+r1 : (i < j ? r1+r2+'s' : r2+r1+'o');
                    const eq = getPrecisionEquity(hand, villainSelectedHands);
                    const cell = document.createElement('div');
                    cell.className = `hand-cell ${eq >= pReq ? 'call' : 'fold'} ${elements.specificHand.value && hand === elements.specificHand.value.slice(0,2) ? 'hero-target' : ''}`;
                    cell.innerHTML = `<span>${hand}</span><span class="eq-val">${(eq*100).toFixed(0)}%</span>`;
                    elements.heatmapGrid.appendChild(cell);
                }
            }
            elements.heatmapSection.classList.remove('hidden');
        }
    };
});
