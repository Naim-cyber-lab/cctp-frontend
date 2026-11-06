/** Vue globale de la consultation : totaux analysés par entreprise sur l'ensemble des lots, calculés depuis l'analyse par lot (aucune donnée dupliquée). */
export function aggregateGlobal(lots) {
  const answered = lots.filter((lot) => lot.companies.length);
  const byCompany = new Map();
  for (const lot of answered) {
    for (const company of lot.companies) {
      const entry = byCompany.get(company.companyId) || { companyId: company.companyId, company: company.company, total: 0, lots: 0, lotsLowest: 0, partial: false, amounts: {} };
      if (company.analysisAmount !== null && company.analysisAmount !== undefined) { entry.total += company.analysisAmount; entry.amounts[lot.lotId] = company.analysisAmount; entry.lots += 1; }
      if (company.isLowest) entry.lotsLowest += 1;
      if (!company.complete) entry.partial = true;
      byCompany.set(company.companyId, entry);
    }
  }
  const companies = [...byCompany.values()].map((entry) => ({ ...entry, total: Math.round(entry.total * 100) / 100, missingLots: answered.length - entry.lots, comparable: entry.lots === answered.length && !entry.partial }));
  const comparable = companies.filter((entry) => entry.comparable);
  const pool = comparable.length ? comparable : companies.filter((entry) => entry.lots > 0);
  const lowest = pool.length ? pool.reduce((best, entry) => (entry.total < best.total ? entry : best)) : null;
  const provisional = Boolean(lowest) && !comparable.length;
  for (const entry of companies) {
    entry.isLowest = Boolean(lowest) && entry.companyId === lowest.companyId;
    entry.differenceToLowestAmount = lowest && !entry.isLowest ? Math.round((entry.total - lowest.total) * 100) / 100 : null;
    entry.differenceToLowestPercent = lowest && !entry.isLowest && lowest.total ? Math.round((entry.total - lowest.total) / lowest.total * 10000) / 100 : null;
  }
  companies.sort((a, b) => a.total - b.total);
  const lotGaps = answered.filter((lot) => lot.economicGaps?.finalGap != null).map((lot) => {
    const lowestInLot = lot.companies.find((company) => company.isLowest);
    return { lotId: lot.lotId, title: lot.title, finalGap: lot.economicGaps.finalGap, lowestCompany: lowestInLot ? lowestInLot.company : "" };
  }).sort((a, b) => b.finalGap - a.finalGap);
  return { companies, lowest, provisional, lotGaps, lotsAnswered: answered.length };
}
