// Primary diagnostics use the ordinary guarded services and saved reports.
export const diagnosticTemplate=`<section aria-labelledby="pcms-diagnostic-heading">
 <h3 id="pcms-diagnostic-heading">Independent checks</h3>
 <p>Check local modules, archive integrity and an isolated data restore. These checks work without a test account or generator.</p>
 <button type="button" id="pcms-diagnostic-independent-run">Check independent modules</button>
 <p id="pcms-diagnostic-independent-status" role="status" aria-live="polite"></p>
 <div id="pcms-diagnostic-independent-results"></div>
 <details><summary>Disposable account diagnostic</summary>
 <p>Use a dedicated test account. PCMS creates a test generator, observes development and waits for your exact source approval before publication. Uncertain operations stop for readback.</p>
 <div class="form-stack">
  <label for="pcms-diagnostic-account">Verified test account</label><select id="pcms-diagnostic-account"></select>
  <label for="pcms-diagnostic-namespace">Test name</label><input id="pcms-diagnostic-namespace" maxlength="42" placeholder="pcms-test-alpha" autocomplete="off" spellcheck="false">
  <label><input id="pcms-diagnostic-consent" type="checkbox"> I authorize live testing with this disposable account and test name.</label>
  <div class="form-foot">
   <button type="button" id="pcms-diagnostic-designate">Save test setup</button>
   <button type="button" id="pcms-diagnostic-run" disabled>Run full diagnostic</button>
   <button type="button" id="pcms-diagnostic-resume" disabled>Resume current run</button>
   <button type="button" id="pcms-diagnostic-rerun" disabled>Start a new run</button>
   <button type="button" id="pcms-diagnostic-cleanup" disabled>Verify test cleanup</button>
  </div>
 </div>
 <p id="pcms-diagnostic-scope" role="status"></p><p id="pcms-diagnostic-status" role="status" aria-live="polite"></p>
 <div id="pcms-diagnostic-stages"></div>
 <p>Backup and isolated restore checks use local data. The restart check asks you to close and reopen Firefox. Live provider, protected route and independent process observations retain their own evidence.</p>
 </details>
 <div class="form-foot"><button type="button" id="pcms-diagnostic-export" disabled>Export current report</button></div>
 <details><summary>Saved diagnostic reports</summary>
 <label for="pcms-diagnostic-history">Report</label><select id="pcms-diagnostic-history"></select>
 <div class="form-foot"><button type="button" id="pcms-diagnostic-history-refresh">Reload reports</button><button type="button" id="pcms-diagnostic-history-export" disabled>Export selected report</button></div>
 <p id="pcms-diagnostic-history-status" role="status"></p><details><summary>Technical report</summary><pre id="pcms-diagnostic-history-view" style="white-space:pre-wrap;overflow-wrap:anywhere"></pre></details>
 </details>
</section>`;
