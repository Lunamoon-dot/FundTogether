# SIM-02 joint-power planning evidence

**Analysis label:** `DESIGN_STAGE_POWER_ANALYSIS`  
**Analysis version:** `sim-02-joint-power-v1`  
**Master seed:** `20261028`  
**Planning replications:** `500`; **bootstrap replications:** `250`

All rows are design-stage planning diagnostics, not substantive FundTogether evidence.

| Scenario | N pairs | Delta correct | Delta resolution | Contrast rho | Marginal resolution | Marginal correctness | Regional joint | Global both-region | Any regional claim | False claim under null |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| favorable | 1500 | 0.100 | 0.050 | 0.937 | 1.000 | 0.917 | 0.912 | 0.840 | 0.984 | � |
| favorable | 2000 | 0.100 | 0.050 | 0.937 | 1.000 | 0.968 | 0.966 | 0.936 | 0.996 | � |
| favorable | 3000 | 0.100 | 0.050 | 0.937 | 1.000 | 0.995 | 0.995 | 0.990 | 1.000 | � |
| correctness_boundary | 1500 | 0.050 | 0.000 | 0.945 | 0.900 | 0.051 | 0.026 | 0.000 | 0.052 | 0.052 |
| correctness_boundary | 2000 | 0.050 | 0.000 | 0.945 | 0.961 | 0.043 | 0.022 | 0.000 | 0.044 | 0.044 |
| correctness_boundary | 3000 | 0.050 | 0.000 | 0.945 | 0.994 | 0.045 | 0.023 | 0.000 | 0.046 | 0.046 |
| resolution_boundary | 1500 | 0.000 | -0.050 | 0.951 | 0.045 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| resolution_boundary | 2000 | 0.000 | -0.050 | 0.951 | 0.033 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| resolution_boundary | 3000 | 0.000 | -0.050 | 0.951 | 0.048 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| correctness_gain_resolution_loss | 1500 | 0.100 | -0.100 | 0.877 | 0.000 | 0.726 | 0.000 | 0.000 | 0.000 | � |
| correctness_gain_resolution_loss | 2000 | 0.100 | -0.100 | 0.877 | 0.000 | 0.844 | 0.000 | 0.000 | 0.000 | � |
| correctness_gain_resolution_loss | 3000 | 0.100 | -0.100 | 0.877 | 0.000 | 0.910 | 0.000 | 0.000 | 0.000 | � |
| no_meaningful_correctness_benefit | 1500 | 0.000 | 0.000 | 0.564 | 0.947 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| no_meaningful_correctness_benefit | 2000 | 0.000 | 0.000 | 0.564 | 0.985 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| no_meaningful_correctness_benefit | 3000 | 0.000 | 0.000 | 0.564 | 1.000 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 |
| strong_positive_dependence | 1500 | 0.100 | 0.050 | 0.937 | 1.000 | 0.908 | 0.900 | 0.822 | 0.978 | � |
| strong_positive_dependence | 2000 | 0.100 | 0.050 | 0.937 | 1.000 | 0.972 | 0.966 | 0.938 | 0.994 | � |
| strong_positive_dependence | 3000 | 0.100 | 0.050 | 0.937 | 1.000 | 0.996 | 0.996 | 0.992 | 1.000 | � |
| weak_unfavorable_dependence | 1500 | 0.100 | 0.050 | -0.076 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | � |
| weak_unfavorable_dependence | 2000 | 0.100 | 0.050 | -0.076 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | � |
| weak_unfavorable_dependence | 3000 | 0.100 | 0.050 | -0.076 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | � |
| scarcity_additional_protocol_failures | 1500 | -0.060 | -0.150 | 0.934 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | � |
| scarcity_additional_protocol_failures | 2000 | -0.060 | -0.150 | 0.934 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | � |
| scarcity_additional_protocol_failures | 3000 | -0.060 | -0.150 | 0.934 | 0.000 | 0.000 | 0.000 | 0.000 | 0.000 | � |
| joint_null_boundary | 1500 | 0.050 | -0.050 | 0.645 | 0.042 | 0.050 | 0.009 | 0.000 | 0.018 | 0.018 |
| joint_null_boundary | 2000 | 0.050 | -0.050 | 0.645 | 0.023 | 0.044 | 0.004 | 0.000 | 0.008 | 0.008 |
| joint_null_boundary | 3000 | 0.050 | -0.050 | 0.645 | 0.036 | 0.035 | 0.003 | 0.000 | 0.006 | 0.006 |

`marginal power != joint power`; the primary planning target is the global both-region column.
The null rows estimate false regional claims with finite planning Monte Carlo uncertainty; they do not prove mathematical calibration.
