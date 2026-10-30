/** Only the newest operation may update a mounted view. No network/auth state is shared. */
export function createAsyncViewScope() {
  let generation=0,disposed=false;
  return {
    begin() {
      const request=++generation;
      return ()=>!disposed&&request===generation;
    },
    invalidate(){generation++;},
    dispose(){disposed=true;generation++;},
  };
}
