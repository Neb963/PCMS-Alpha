// R3 is an active slice: make its actual production-boundary and native
// fault-injection tests part of the existing trusted i00-*.test.mjs fast lane.
// Keep test selection policy and CI trust root unchanged.
import './r3-readiness.test.mjs';
import './r3-native-environment.test.mjs';
