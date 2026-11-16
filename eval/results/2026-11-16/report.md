# Evaluation report: eval/questions.jsonl

Written 2026-11-16. It covers 50 of the 50 questions selected (50 in the set).

Spend of the evaluation so far: US$19.2767 against a cap of US$45.0000: runs US$12.2752, classification US$0.0008, judging US$7.0008. This invocation spent US$0.0000.

| Role | Model |
| --- | --- |
| panel.grok | spacexai/grok-4.7 (low) |
| panel.claude | anthropic/claude-opus-5.5 (medium) |
| panel.openai | openai/gpt-6.1-sol (medium) |
| panel.gemini | google/gemini-4-argon (medium) |
| utility | anthropic/claude-haiku-5.5 |
| classifier | typesafe-ai/jev-1.14.0 |

## Criteria to go on

| Area | Check | Measured | Bar | Result |
| --- | --- | --- | --- | --- |
| The protocol is sound | Runs that finish without an invalid output stopping them | 100% (50 of 50) | at least 95% | pass |
| The protocol is sound | Wall-clock of the full protocol, 95th percentile | 177.8 s | under 180 s | pass |
| Collaboration beats one model | Correct answers: Q against the best single model | 26 against 27 (of 28) | Q no fewer | fail |
| Collaboration beats one model | Blind pairs Q won or tied against the best single model, by the judges | 32% (16 of 50) | at least 60% | fail |
| Collaboration beats one model | Blind pairs Q won or tied against the best single model, by the user | not graded yet | at least 60% | pending |
| The rounds earn their cost | Questions with contested paragraphs whose substance the rounds changed | 63% (29 of 46) | at least 30% | pass |
| The rounds earn their cost | Improvements against regressions | 26 against 2 | 2 to 1 or better | pass |
| The rounds earn their cost | Mean cost of T over mean cost of Q | 1.75× | at most 2.5× | pass |
| The classifier can set the price | Agreement with the hand-set class | 76% (38 of 50) | at least 85% | fail |

## Correctness

Over the 28 questions with a gold answer. Each arm's answer is right or wrong by the majority of the four judges; a tie is wrong, a missing answer is wrong.

| Arm | Correct |
| --- | --- |
| Grok alone | 27 of 28 (96%) |
| Claude alone | 27 of 28 (96%) |
| ChatGPT alone | 28 of 28 (100%) |
| Gemini alone | 26 of 28 (93%) |
| Q (drafts and merge) | 26 of 28 (93%) |
| T (full protocol) | 27 of 28 (96%) |

Agreement between judges: 99% of judge pairs agree; 163 of 166 answers were judged unanimously.

## Quality and the best single model

Mean grade of the judges, from 1 to 5, over all questions graded; a missing answer counts 0.

| Arm | Mean quality | Questions |
| --- | --- | --- |
| Grok alone | 4.39 | 50 |
| Claude alone | 4.62 | 50 |
| ChatGPT alone | 4.39 | 50 |
| Gemini alone | 4.22 | 50 |
| Q (drafts and merge) | 4.25 | 50 |
| T (full protocol) | 4.62 | 50 |

The best single model, chosen after the fact: **Claude**, mean quality 4.62 over 50 questions. Ties go to more correct answers, then to the fixed order Grok, Claude, OpenAI, Gemini.

## Blind pairwise preference

| Pair | Questions | First wins | Ties | Second wins | First wins or ties |
| --- | --- | --- | --- | --- | --- |
| Q against the best single model, majority of judges | 50 | 7 Q | 9 | 34 single | 32% |
|   judge Grok | 50 | 9 Q | 6 | 35 single | 30% |
|   judge Claude | 50 | 7 Q | 7 | 36 single | 28% |
|   judge ChatGPT | 50 | 18 Q | 3 | 29 single | 42% |
|   judge Gemini | 50 | 9 Q | 10 | 31 single | 38% |
| T against Q where they differ, majority of judges | 37 | 32 T | 3 | 2 Q | 95% |
|   judge Grok | 37 | 30 T | 2 | 5 Q | 86% |
|   judge Claude | 37 | 33 T | 2 | 2 Q | 95% |
|   judge ChatGPT | 37 | 36 T | 0 | 1 Q | 97% |
|   judge Gemini | 37 | 31 T | 2 | 4 Q | 89% |
| T against the best single model (extra), majority of judges | 50 | 18 T | 17 | 15 single | 70% |
|   judge Grok | 50 | 24 T | 10 | 16 single | 68% |
|   judge Claude | 50 | 19 T | 7 | 24 single | 52% |
|   judge ChatGPT | 50 | 31 T | 5 | 14 single | 72% |
|   judge Gemini | 50 | 12 T | 17 | 21 single | 58% |

The majority is the verdict of more judges than any other; otherwise a tie. Where the best single model had no answer, Q wins (0 questions). T and Q have the same text on 13 questions.

T against the best single model is an extra measure, outside the criteria of the plan, whose check compares Q with the best single model; it follows the rules of that pair (T wins where the best single model had no answer, a tie where the texts are the same: 0 questions).

The user has not graded the sheet yet: eval\results\2026-11-16\grading-sheet.md (20 pairs).

## The rounds

| Measure | Value |
| --- | --- |
| Questions with contested paragraphs after the merge | 46 |
| Of them, questions where rounds ran | 46 |
| The rounds changed the substance (majority of judges) | 29 (63%) |
| Changes that improved the answer (T preferred) | 26 |
| Changes that worsened it (Q preferred) | 2 |
| Changes judged a tie | 1 |

## Herding and dissent

61 votes changed position. By the majority of judges, 53 carried a new argument, 4 only deferred to the others, 4 split the judges.

| Voter | Changed votes | Deferring |
| --- | --- | --- |
| Grok | 17 | 0 |
| Claude | 15 | 2 |
| ChatGPT | 9 | 0 |
| Gemini | 20 | 2 |

| Suggestions not adopted | Judged | Right | Wrong | Unclear |
| --- | --- | --- | --- | --- |
| Dissent notes (open or unresolved) | 15 | 5 | 4 | 6 |
| Rejected suggestions | 14 | 5 | 4 | 5 |

## Editor choice

37 runs reached the editor. On 20 both policies pick the same editor, so the finals are the same. The finals differ on 9.

| Policy | Rewrites | Kept by the check | Dropped by the check |
| --- | --- | --- | --- |
| Closest to the majority | 25 | 14 | 11 |
| Rotation | 20 | 13 | 7 |

| Pair | Questions | First wins | Ties | Second wins | First wins or ties |
| --- | --- | --- | --- | --- | --- |
| Closest against rotation where the finals differ | 9 | 0 closest | 9 | 0 rotation | 100% |

## Soundness

50 of 50 runs completed. Flags raised: mergeFallback 2.

| Seat | Calls | OK | Invalid | Timeout | Refusal | Error |
| --- | --- | --- | --- | --- | --- | --- |
| Grok | 156 | 151 | 0 | 5 | 0 | 0 |
| Claude | 158 | 158 | 0 | 0 | 0 | 0 |
| ChatGPT | 151 | 151 | 0 | 0 | 0 | 0 |
| Gemini | 160 | 155 | 0 | 5 | 0 | 0 |
| utility | 247 | 245 | 2 | 0 | 0 | 0 |

| Judge | Calls | Abstained |
| --- | --- | --- |
| Grok | 181 | 1 |
| Claude | 181 | 0 |
| ChatGPT | 181 | 0 |
| Gemini | 181 | 0 |

## Cost and wall-clock per question

From the same runs: a draft's own call for each model alone; the drafts plus the merge for Q; the whole run for T. Wall-clock is the longest call of each step, summed.

|  | Runs | Mean cost | Median cost | 95th pct cost | Median time | 95th pct time |
| --- | --- | --- | --- | --- | --- | --- |
| Grok alone | 50 | US$0.0246 | US$0.0262 | US$0.0465 | 13.5 s | 37.1 s |
| Claude alone | 50 | US$0.0647 | US$0.0391 | US$0.1940 | 16.7 s | 39.2 s |
| ChatGPT alone | 50 | US$0.0236 | US$0.0270 | US$0.0378 | 9.5 s | 27.9 s |
| Gemini alone | 50 | US$0.0252 | US$0.0313 | US$0.0428 | 23.1 s | 90.0 s |
| Q (drafts and merge) | 50 | US$0.1396 | US$0.1338 | US$0.2653 | 39.6 s | 93.3 s |
| T (full protocol) | 50 | US$0.2437 | US$0.2210 | US$0.4645 | 103.2 s | 177.8 s |

|  | Runs | Mean cost | Median cost | 95th pct cost | Median time | 95th pct time |
| --- | --- | --- | --- | --- | --- | --- |
| simple (hand-set), Q | 21 | US$0.1116 | US$0.1073 | US$0.1951 | 31.5 s | 93.3 s |
| simple (hand-set), T | 21 | US$0.1826 | US$0.1849 | US$0.3082 | 70.4 s | 129.9 s |
| complex (hand-set), Q | 29 | US$0.1598 | US$0.1785 | US$0.2858 | 49.8 s | 69.2 s |
| complex (hand-set), T | 29 | US$0.2880 | US$0.2892 | US$0.5136 | 123.5 s | 183.3 s |
| simple (classifier), Q | 17 | US$0.0946 | US$0.0768 | US$0.1899 | 23.6 s | 93.3 s |
| simple (classifier), T | 17 | US$0.1416 | US$0.1298 | US$0.2663 | 66.0 s | 111.5 s |
| complex (classifier), Q | 33 | US$0.1627 | US$0.1674 | US$0.2858 | 49.8 s | 94.7 s |
| complex (classifier), T | 33 | US$0.2963 | US$0.2931 | US$0.5136 | 125.3 s | 183.3 s |

## The classifier

38 of 50 questions agree with the hand-set class (76%). 0 classifications failed and count as complex; 8 chose simple with a probability under 0.7 and count as complex. A classification costs US$0.0000 (median) and takes 0.3 s.

| Hand-set \ classifier | simple | complex | failed |
| --- | --- | --- | --- |
| simple | 13 | 8 | 0 |
| complex | 4 | 25 | 0 |

## Per question

| Question | Category | Hand-set | Classifier | Run | Contested | Q correct | T correct | Q vs single | T vs Q | T vs single | T cost | T time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| q01 | stable_fact | simple | simple | completed | yes | yes | yes | Q | tie | T | US$0.1899 | 96.3 s |
| q02 | stable_fact | simple | simple | completed | yes | yes | yes | single | T | T | US$0.1656 | 66.0 s |
| q03 | stable_fact | simple | complex | completed | yes | yes | yes | single | T | T | US$0.2538 | 125.3 s |
| q04 | stable_fact | simple | simple | completed |  | yes | yes | single | same text | single | US$0.0572 | 17.8 s |
| q05 | stable_fact | simple | simple | completed | yes | yes | yes | tie | same text | tie | US$0.1298 | 74.3 s |
| q06 | stable_fact | simple | simple | completed | yes | yes | yes | single | same text | single | US$0.0592 | 111.5 s |
| q07 | stable_fact | simple | simple | completed | yes | yes | yes | Q | same text | T | US$0.0999 | 32.2 s |
| q08 | stable_fact | simple | simple | completed | yes | yes | yes | single | same text | tie | US$0.0459 | 26.5 s |
| q09 | stable_fact | simple | simple | completed | yes | yes | yes | tie | T | tie | US$0.1233 | 67.8 s |
| q10 | stable_fact | complex | complex | completed |  | yes | yes | tie | same text | single | US$0.2000 | 34.0 s |
| q11 | stable_fact | simple | simple | completed |  | yes | yes | single | same text | single | US$0.0893 | 25.2 s |
| q12 | stable_fact | simple | simple | completed | yes | yes | yes | single | T | tie | US$0.1687 | 70.4 s |
| q13 | recent_fact | simple | simple | completed | yes | yes | yes | tie | same text | tie | US$0.2232 | 47.1 s |
| q14 | recent_fact | simple | complex | completed | yes | yes | yes | single | T | T | US$0.2887 | 90.2 s |
| q15 | recent_fact | simple | complex | completed | yes | yes | yes | tie | tie | tie | US$0.3082 | 129.9 s |
| q16 | recent_fact | simple | complex | completed | yes | yes | no | single | Q | single | US$0.2931 | 177.8 s |
| q17 | recent_fact | complex | complex | completed | yes | yes | yes | single | T | T | US$0.3573 | 159.2 s |
| q18 | recent_fact | simple | simple | completed | yes | yes | yes | Q | same text | T | US$0.1849 | 55.2 s |
| q19 | recent_fact | simple | simple | completed | yes | yes | yes | Q | T | T | US$0.2124 | 70.1 s |
| q20 | recent_fact | simple | complex | completed | yes | no | yes | single | T | tie | US$0.2947 | 122.4 s |
| q21 | multi_step | complex | complex | completed | yes | yes | yes | single | T | T | US$0.2571 | 164.3 s |
| q22 | multi_step | complex | simple | completed | yes | yes | yes | single | T | tie | US$0.0961 | 75.7 s |
| q23 | multi_step | complex | complex | completed | yes | yes | yes | single | T | tie | US$0.0846 | 47.0 s |
| q24 | multi_step | complex | complex | completed | yes | yes | yes | tie | same text | tie | US$0.0842 | 33.8 s |
| q25 | multi_step | complex | complex | completed | yes | yes | yes | tie | T | T | US$0.1314 | 83.1 s |
| q26 | multi_step | complex | complex | completed | yes | no | yes | Q | T | T | US$0.1188 | 118.3 s |
| q27 | multi_step | complex | complex | completed | yes | yes | yes | single | T | tie | US$0.1612 | 92.4 s |
| q28 | multi_step | complex | complex | completed | yes | yes | yes | single | T | T | US$0.1288 | 70.5 s |
| q29 | contested | complex | complex | completed | yes |  |  | single | T | single | US$0.5136 | 148.7 s |
| q30 | contested | complex | complex | completed | yes |  |  | single | T | T | US$0.2577 | 123.5 s |
| q31 | contested | complex | complex | completed | yes |  |  | single | T | T | US$0.5162 | 134.7 s |
| q32 | contested | complex | complex | completed | yes |  |  | Q | T | T | US$0.4402 | 183.3 s |
| q33 | contested | complex | complex | completed | yes |  |  | single | T | tie | US$0.3607 | 139.1 s |
| q34 | contested | complex | complex | completed | yes |  |  | single | T | tie | US$0.2915 | 149.1 s |
| q35 | contested | complex | complex | completed | yes |  |  | tie | T | T | US$0.4296 | 117.9 s |
| q36 | contested | complex | complex | completed | yes |  |  | single | T | single | US$0.3938 | 129.5 s |
| q37 | how_to | complex | complex | completed | yes |  |  | single | T | single | US$0.4333 | 172.3 s |
| q38 | how_to | simple | complex | completed | yes |  |  | Q | T | T | US$0.2188 | 117.5 s |
| q39 | how_to | complex | complex | completed | yes |  |  | single | T | tie | US$0.3865 | 143.0 s |
| q40 | how_to | simple | complex | completed | yes |  |  | single | Q | single | US$0.3172 | 129.4 s |
| q41 | how_to | complex | complex | completed | yes |  |  | single | T | single | US$0.4535 | 146.5 s |
| q42 | how_to | complex | complex | completed | yes |  |  | single | T | single | US$0.4645 | 189.5 s |
| q43 | how_to | simple | complex | completed |  |  |  | single | same text | single | US$0.1107 | 39.9 s |
| q44 | how_to | complex | complex | completed | yes |  |  | single | T | tie | US$0.4473 | 154.3 s |
| q45 | false_premise | complex | complex | completed | yes |  |  | single | T | tie | US$0.1751 | 54.9 s |
| q46 | false_premise | complex | simple | completed | yes |  |  | single | same text | single | US$0.2182 | 52.4 s |
| q47 | false_premise | complex | complex | completed | yes |  |  | single | T | tie | US$0.3173 | 124.0 s |
| q48 | false_premise | complex | complex | completed | yes |  |  | single | T | T | US$0.2892 | 110.2 s |
| q49 | false_premise | complex | simple | completed | yes |  |  | tie | tie | single | US$0.2663 | 81.5 s |
| q50 | false_premise | complex | simple | completed | yes |  |  | single | same text | single | US$0.0770 | 25.2 s |

Categories: stable_fact, recent_fact, multi_step, contested, how_to, false_premise.
