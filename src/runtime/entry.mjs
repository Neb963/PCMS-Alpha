// Statically evaluate the unmodified donor fail-closed gate before registering
// PCMS wake sources. Neither module awaits during listener registration.
import '../lib/recovery-bootstrap.js';
import './wake.mjs';
// Independent PCMS journal/command listener; it never controls donor recovery.
import './command-boundary.mjs';
// I03 listeners are registered in the synchronous entry evaluation path.
import './account-boundary.mjs';
// I04 read-only inventory and durable local observation registration.
import './inventory-boundary.mjs';
// Operator-triggered read-only private Git inspection and canonical mapping.
import './source-boundary.mjs';

// I06 frozen allocation and held guarded two-stage provider dispatcher.
import './supply-boundary.mjs';

// I07 explicitly consented, read-only original-source capture.
import './adoption-boundary.mjs';
