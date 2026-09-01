import { analyzeLexicalThresholds } from './threshold-analysis.js';

import {
  analyzeStoryClusteringPairs,
  getLeastLexicallySimilarPositivePairs,
  getMostLexicallySimilarNegativePairs,
} from './pairwise-analysis.js';

import { phase2StoryClusteringBaseline } from './baselines/phase2-story-clustering.js';

import { analyzeInformativeTokenSimilarity } from './informative-token-analysis.js';

import { analyzeInformativeTokenThresholds } from './informative-threshold-analysis.js';

import { analyzeDistinctiveTokens } from './distinctive-token-analysis.js';

import { analyzeDistinctiveTokenThresholds } from './distinctive-threshold-analysis.js';

const analysis = analyzeStoryClusteringPairs(phase2StoryClusteringBaseline);

const thresholds = analyzeLexicalThresholds(analysis.pairs);

const informative = analyzeInformativeTokenSimilarity(
  phase2StoryClusteringBaseline,
  analysis.pairs,
);

const informativeThresholds = analyzeInformativeTokenThresholds(informative.pairs);

const distinctive = analyzeDistinctiveTokens(phase2StoryClusteringBaseline, analysis.pairs);

const distinctiveThresholds = analyzeDistinctiveTokenThresholds(distinctive);

console.log('');
console.log('Phase 2 Story Similarity Signal Analysis');
console.log('');
console.log(`Corpus: ${analysis.corpusId}`);
console.log(`Pairs: ${analysis.pairs.length}`);
console.log(`Same-story pairs: ${analysis.positivePairs.length}`);
console.log(`Different-story pairs: ${analysis.negativePairs.length}`);

console.log('');
console.log('Same-story signal distribution');
printSummary(analysis.positiveSummary);

console.log('');
console.log('Different-story signal distribution');
printSummary(analysis.negativeSummary);

console.log('');
console.log('Most lexically similar different-story pairs');

for (const pair of getMostLexicallySimilarNegativePairs(
  analysis,
  Math.min(5, analysis.negativePairs.length),
)) {
  printPair(pair);
}

console.log('');
console.log('Least lexically similar same-story pairs');

for (const pair of getLeastLexicallySimilarPositivePairs(
  analysis,
  Math.min(5, analysis.positivePairs.length),
)) {
  printPair(pair);
}

console.log('');
console.log('Best lexical threshold by F1');
console.log(JSON.stringify(thresholds.bestF1, null, 2));

console.log('');
console.log('Best lexical threshold with zero false merges');
console.log(JSON.stringify(thresholds.bestZeroFalseMerge, null, 2));

console.log('');
console.log('Informative-token weighted Jaccard diagnostic');

console.log(`  Documents: ${informative.tokenStatistics.documentCount}`);

console.log(
  `  Same-story: min=${formatNullable(informative.positiveSummary.min)} mean=${formatNullable(
    informative.positiveSummary.mean,
  )} max=${formatNullable(informative.positiveSummary.max)}`,
);

console.log(
  `  Different-story: min=${formatNullable(informative.negativeSummary.min)} mean=${formatNullable(
    informative.negativeSummary.mean,
  )} max=${formatNullable(informative.negativeSummary.max)}`,
);

console.log('');
console.log('Informative-token dangerous different-story pairs');

for (const pair of [...informative.negativePairs]
  .sort((left, right) => right.weightedTokenJaccard - left.weightedTokenJaccard)
  .slice(0, 5)) {
  console.log(
    [
      `  ${pair.scenarioId}`,
      `${pair.leftArticleId} ↔ ${pair.rightArticleId}`,
      `weightedJaccard=${format(pair.weightedTokenJaccard)}`,
    ].join(' | '),
  );
}

console.log('');
console.log('Informative-token weakest same-story pairs');

for (const pair of [...informative.positivePairs]
  .sort((left, right) => left.weightedTokenJaccard - right.weightedTokenJaccard)
  .slice(0, 5)) {
  console.log(
    [
      `  ${pair.scenarioId}`,
      `${pair.leftArticleId} ↔ ${pair.rightArticleId}`,
      `weightedJaccard=${format(pair.weightedTokenJaccard)}`,
    ].join(' | '),
  );
}

console.log('');
console.log('Best informative-token threshold by F1');

console.log(JSON.stringify(informativeThresholds.bestF1, null, 2));

console.log('');
console.log('Best informative-token threshold with zero false merges');

console.log(JSON.stringify(informativeThresholds.bestZeroFalseMerge, null, 2));

console.log('');
console.log('Distinctive-token diagnostic');

console.log(`  Tested DF cutoffs: ${distinctive.cutoffs.length}`);

for (const cutoff of distinctive.cutoffs) {
  console.log('');
  console.log(`  Max document frequency: ${cutoff.maximumDocumentFrequency}`);

  console.log(
    [
      '    Same-story distinctive Jaccard:',
      `min=${formatNullable(cutoff.positiveSummary.distinctiveTokenJaccard.min)}`,
      `mean=${formatNullable(cutoff.positiveSummary.distinctiveTokenJaccard.mean)}`,
      `max=${formatNullable(cutoff.positiveSummary.distinctiveTokenJaccard.max)}`,
    ].join(' '),
  );

  console.log(
    [
      '    Different-story distinctive Jaccard:',
      `min=${formatNullable(cutoff.negativeSummary.distinctiveTokenJaccard.min)}`,
      `mean=${formatNullable(cutoff.negativeSummary.distinctiveTokenJaccard.mean)}`,
      `max=${formatNullable(cutoff.negativeSummary.distinctiveTokenJaccard.max)}`,
    ].join(' '),
  );
}

console.log('');
console.log('Best distinctive-token threshold by F1');

console.log(JSON.stringify(distinctiveThresholds.bestF1, null, 2));

console.log('');
console.log('Best distinctive-token threshold with zero false merges');

console.log(JSON.stringify(distinctiveThresholds.bestZeroFalseMerge, null, 2));

if (distinctiveThresholds.bestZeroFalseMerge !== null) {
  const selected = distinctiveThresholds.bestZeroFalseMerge;

  const selectedCutoff = distinctive.cutoffs.find(
    (cutoff) => cutoff.maximumDocumentFrequency === selected.maximumDocumentFrequency,
  );

  if (selectedCutoff !== undefined) {
    console.log('');
    console.log('Selected zero-false-merge distinctive-token pair inspection');

    console.log('');
    console.log('  Weakest same-story pairs');

    for (const pair of [...selectedCutoff.positivePairs]
      .sort((left, right) => left.distinctiveTokenJaccard - right.distinctiveTokenJaccard)
      .slice(0, 5)) {
      console.log(
        [
          `    ${pair.scenarioId}`,
          `${pair.leftArticleId} ↔ ${pair.rightArticleId}`,
          `shared=${pair.sharedDistinctiveTokenCount}`,
          `jaccard=${format(pair.distinctiveTokenJaccard)}`,
        ].join(' | '),
      );
    }

    console.log('');
    console.log('  Strongest different-story pairs');

    for (const pair of [...selectedCutoff.negativePairs]
      .sort((left, right) => right.distinctiveTokenJaccard - left.distinctiveTokenJaccard)
      .slice(0, 5)) {
      console.log(
        [
          `    ${pair.scenarioId}`,
          `${pair.leftArticleId} ↔ ${pair.rightArticleId}`,
          `shared=${pair.sharedDistinctiveTokenCount}`,
          `jaccard=${format(pair.distinctiveTokenJaccard)}`,
        ].join(' | '),
      );
    }
  }
}

function printSummary(summary: typeof analysis.positiveSummary): void {
  console.log(`  Count: ${summary.count}`);

  console.log(`  Jaccard: ${formatRange(summary.titleTokenJaccard)}`);

  console.log(`  Order:   ${formatRange(summary.titleTokenOrderSimilarity)}`);

  const time = summary.publicationTimeDistanceMs;

  console.log(
    `  Time ms: min=${formatNullable(time.min)} mean=${formatNullable(
      time.mean,
    )} max=${formatNullable(time.max)}`,
  );
}

function printPair(pair: (typeof analysis.pairs)[number]): void {
  console.log(
    [
      `  ${pair.scenarioId}`,
      `${pair.leftArticleId} ↔ ${pair.rightArticleId}`,
      `jaccard=${format(pair.signals.titleTokenJaccard)}`,
      `order=${format(pair.signals.titleTokenOrderSimilarity)}`,
      `timeMs=${formatNullable(pair.signals.publicationTimeDistanceMs)}`,
    ].join(' | '),
  );
}

function formatRange(input: {
  min: number | null;
  mean: number | null;
  max: number | null;
}): string {
  return [
    `min=${formatNullable(input.min)}`,
    `mean=${formatNullable(input.mean)}`,
    `max=${formatNullable(input.max)}`,
  ].join(' ');
}

function format(value: number): string {
  return value.toFixed(4);
}

function formatNullable(value: number | null): string {
  return value === null ? 'null' : value.toFixed(2);
}
