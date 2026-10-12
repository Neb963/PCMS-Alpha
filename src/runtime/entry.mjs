// Statically evaluate the unmodified donor fail-closed gate before registering
// PCMS wake sources. Neither module awaits during listener registration.
import '../lib/recovery-bootstrap.js';
import './wake.mjs';
