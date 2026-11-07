import { Navigate, useLocation } from 'react-router-dom';

/*
 * /advertise used to be its own page; its "On NowOpen" content now lives in
 * the Promote hub (/adverts). Old links, emails and bookmarks keep working:
 * they land on the hub, at the section they were after. `#preview` is the one
 * other anchor the old page had; anything else opens the On NowOpen section.
 * `replace` so Back does not return to a redirect that bounces forward again.
 * /advertise/plan* are separate routes and are not touched by this.
 */
export default function AdvertiseRedirect() {
  const { hash } = useLocation();
  return <Navigate replace to={`/adverts${hash === '#preview' ? '#preview' : '#on-nowopen'}`} />;
}
