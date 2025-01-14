import { useContext, useEffect, useRef, useState } from 'react';
import AppContext, { OBJECT_TYPE_POI } from '../../context/AppContext';
import { useMap } from 'react-leaflet';
import _ from 'lodash';
import L from 'leaflet';
import { changeIconColor, getIconUrlByName, getSvgBackground } from '../markers/MarkerOptions';
import 'leaflet-spin';
import PoiManager, { DEFAULT_ICON_COLOR, DEFAULT_POI_COLOR, DEFAULT_POI_SHAPE } from '../../manager/PoiManager';
import 'leaflet.markercluster';
import { Alert } from '@mui/material';
import { apiPost } from '../../util/HttpApi';
import {
    FINAL_ICON_NAME,
    ICON_KEY_NAME,
    ICON_NAME,
    POI_NAME,
    TYPE_OSM_TAG,
    TYPE_OSM_VALUE,
} from '../../infoblock/components/wpt/WptTagsProvider';

export default function PoiLayer() {
    const ctx = useContext(AppContext);
    const map = useMap();
    const [prevZoom, setPrevZoom] = useState(null);
    const [prevTypesLength, setPrevTypesLength] = useState(null);
    const [zoom, setZoom] = useState(null);
    const [move, setMove] = useState(false);
    const [poiList, setPoiList] = useState({
        layer: null,
        prevLayer: null,
    });
    const [prevController, setPrevController] = useState(false);
    const [useLimit, setUseLimit] = useState(false);
    const [addAlert, setAddAlert] = useState(false);
    const [bbox, setBbox] = useState(null);
    const [prevCategoriesCount, setPrevCategoriesCount] = useState(null);

    async function getPoi(controller, showPoiCategories, bbox, savedBbox) {
        const searchData = {
            categories: showPoiCategories,
            northWest: `${bbox.getNorthWest().lat},${bbox.getNorthWest().lng}`,
            southEast: `${bbox.getSouthEast().lat},${bbox.getSouthEast().lng}`,
            savedNorthWest: savedBbox ? `${savedBbox.getNorthWest().lat},${savedBbox.getNorthWest().lng}` : null,
            savedSouthEast: savedBbox ? `${savedBbox.getSouthEast().lat},${savedBbox.getSouthEast().lng}` : null,
            prevCategoriesCount: prevCategoriesCount,
        };
        let response = await apiPost(
            `${process.env.REACT_APP_ROUTING_API_SITE}/routing/search/search-poi?`,
            searchData,
            {
                signal: controller.signal,
            }
        );
        if (response?.data) {
            return response.data;
        } else {
            console.error(`Pois not found`);
        }
    }

    useEffect(() => {
        if (map) {
            map.on('zoomend', () => {
                setZoom(map.getZoom());
            });

            map.on('dragend', () => {
                setMove(true);
            });
        }
    }, [map]);

    function typesChanged() {
        return !_.isEmpty(ctx.showPoiCategories) && prevTypesLength !== ctx.showPoiCategories?.length;
    }

    const debouncedGetPoi = useRef(
        _.debounce(
            async ({
                controller,
                ignore,
                poiList,
                showPoiCategories,
                savedBbox,
                prevCategoriesCount,
                poiIconCache,
            }) => {
                map.spin(true, { color: '#1976d2' });
                let bbox = map.getBounds();
                await getPoi(controller, showPoiCategories, bbox, savedBbox, prevCategoriesCount).then(async (res) => {
                    map.spin(false);
                    if (res && !ignore) {
                        if (!res.alreadyFound) {
                            if (!res.mapLimitExceeded && res.features) {
                                const layer = await createPoiLayer({
                                    poiList: res.features.features,
                                    globalPoiIconCache: poiIconCache,
                                });
                                const newPoiList = {
                                    prevLayer: _.cloneDeep(poiList.layer),
                                    layer: layer,
                                };
                                setPoiList(newPoiList);
                                setBbox(!res.useLimit ? bbox : null);
                                setPrevCategoriesCount(showPoiCategories.length);
                                setUseLimit(res.useLimit);
                            }
                        }
                        if (res.mapLimitExceeded) {
                            setAddAlert(true);
                        }
                    }
                });
            },
            1000
        )
    ).current;

    function allPoiFound(zoom, prevZoom) {
        return prevZoom && zoom > prevZoom && !useLimit;
    }

    useEffect(() => {
        let ignore = false;
        let controller = new AbortController();

        async function getPoiList() {
            if (
                ((!allPoiFound(zoom, prevZoom) && zoom !== prevZoom) || move || typesChanged()) &&
                !_.isEmpty(ctx.showPoiCategories)
            ) {
                if (prevController) {
                    prevController.abort();
                }
                setPrevController(controller);
                setPrevZoom(_.cloneDeep(zoom));
                setPrevTypesLength(_.cloneDeep(ctx.showPoiCategories.length));
                debouncedGetPoi({
                    controller,
                    ignore,
                    poiList,
                    showPoiCategories: ctx.showPoiCategories,
                    savedBbox: bbox,
                    prevCategoriesCount,
                    poiIconCache: ctx.poiIconCache,
                });
            } else {
                if (poiList.layer && _.isEmpty(ctx.showPoiCategories)) {
                    const newPoiList = {
                        prevLayer: _.cloneDeep(poiList.layer),
                        layer: null,
                    };
                    setPoiList(newPoiList);
                }
            }
        }

        if (zoom < 8 && !_.isEmpty(ctx.showPoiCategories)) {
            setAddAlert(true);
        } else {
            setAddAlert(false);
            getPoiList().then();
            return () => {
                ignore = true;
            };
        }
    }, [zoom, move, ctx.showPoiCategories]);

    useEffect(() => {
        if (poiList.layer && !map.hasLayer(poiList.layer)) {
            poiList.layer.addTo(map).on('click', onClick);
        }
        if (poiList.prevLayer) {
            map.removeLayer(poiList.prevLayer);
        }
        setMove(false);
    }, [poiList]);

    function onClick(e) {
        ctx.setCurrentObjectType(OBJECT_TYPE_POI);
        const poi = {
            options: e.sourceTarget.options,
            latlng: e.sourceTarget._latlng,
        };
        let newPoi = {
            poi: poi,
        };
        ctx.setSelectedWpt(newPoi);
    }

    /**
     * Asynchronously creates a cache of Point of Interest (POI) icons.
     *
     * @param {Array} poiList - The list of POIs for which icons should be cached.
     * @param {Object} poiIconCache - The existing cache of POI icons.
     * @returns {Object} - The updated cache of POI icons.
     */
    async function createPoiCache(poiList, poiIconCache) {
        const iconCache = {};
        for (const poi of poiList) {
            // Get the icon name for the current POI
            const iconWpt = PoiManager.getIconNameForPoiType(
                poi.properties[ICON_KEY_NAME],
                poi.properties[TYPE_OSM_TAG],
                poi.properties[TYPE_OSM_VALUE],
                poi.properties[ICON_NAME]
            );

            if (iconWpt) {
                // If the icon is already in the existing cache, copy it to the updated cache
                if (poiIconCache[iconWpt]) {
                    iconCache[iconWpt] = poiIconCache[iconWpt];
                } else {
                    // If the icon is not in the existing cache and not yet in the updated cache
                    if (!iconCache[iconWpt]) {
                        try {
                            const response = await fetch(getIconUrlByName('poi', iconWpt));
                            iconCache[iconWpt] = await response.text();
                        } catch (error) {
                            console.error(`Failed to fetch SVG for iconWpt ${iconWpt}: ${error}`);
                        }
                    }
                }
            }
        }
        return iconCache;
    }

    async function createPoiLayer({ poiList = [], globalPoiIconCache }) {
        const innerCache = await createPoiCache(poiList, globalPoiIconCache);
        ctx.setPoiIconCache({ ...innerCache });
        const layers = await Promise.all(
            poiList.map(async (poi) => {
                const finalIconName = PoiManager.getIconNameForPoiType(
                    poi.properties[ICON_KEY_NAME],
                    poi.properties[TYPE_OSM_TAG],
                    poi.properties[TYPE_OSM_VALUE],
                    poi.properties[ICON_NAME]
                );
                const icon = await getPoiIcon(poi, innerCache, finalIconName);
                const coord = poi.geometry.coordinates;
                return new L.Marker(new L.LatLng(coord[1], coord[0]), {
                    ...poi.properties,
                    title: poi.properties[POI_NAME],
                    icon: icon,
                    [FINAL_ICON_NAME]: finalIconName,
                });
            })
        );

        if (layers.length) {
            return L.featureGroup(layers);
        } else {
            return L.featureGroup(); // return an empty layer group if there are no layers
        }
    }

    async function getPoiIcon(poi, cache, finalIconName) {
        const svg = getSvgBackground(DEFAULT_POI_COLOR, DEFAULT_POI_SHAPE);
        if (finalIconName) {
            let svgData;
            if (cache[finalIconName]) {
                svgData = cache[finalIconName];
                const coloredSvg = changeIconColor(svgData, DEFAULT_ICON_COLOR);
                const poiName = poi.properties[POI_NAME];
                const iconHtml = `<div>${svg}<div class="icon" id="se-wpt-marker-icon-${finalIconName}-${DEFAULT_ICON_COLOR}-${poiName}">${coloredSvg}</div></div>`;
                return L.divIcon({ html: iconHtml });
            }
        }
    }

    return (
        <>
            {addAlert && (
                <Alert sx={{ position: 'absolute', zIndex: 1000, left: '40%', top: '2%' }} severity="info">
                    Please zoom in closer!
                </Alert>
            )}
        </>
    );
}
