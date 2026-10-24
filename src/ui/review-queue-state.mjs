// Presentation grouping only. No group is source, test or effect authority.
export function reviewQueueGroup(state){
 if(state==='CONFIRMED_PUBLIC')return 'COMPLETED';
 if(state==='PUBLISHING')return 'RUNNING';
 if(['APPROVED','WAITING_FOR_GIT','CHANGES_REQUESTED','IN_DEVELOPMENT'].includes(state))return 'WAITING';
 return 'NEEDS_ACTION';
}
export function matchesReviewGroup(state,group='ALL'){return group==='ALL'||reviewQueueGroup(state)===group;}
