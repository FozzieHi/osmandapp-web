import React, { forwardRef, useContext, useEffect } from 'react';
import AppContext, { OBJECT_TYPE_WEATHER } from '../../context/AppContext';
import { Box, Checkbox, FormControlLabel, MenuItem, Paper, Typography } from '@mui/material';
import styles from '../trackfavmenu.module.css';
import weatherStyles from './weather.module.css';
import { FormControl } from '@mui/material/';
import WeatherManager, { ECWMF_WEATHER_TYPE } from '../../manager/WeatherManager';
import ActionItem from '../components/ActionItem';
import _ from 'lodash';

const WeatherLayersActions = forwardRef((props, ref) => {
    const ctx = useContext(AppContext);

    useEffect(() => {
        if (ctx.currentObjectType === OBJECT_TYPE_WEATHER) {
            WeatherManager.displayWeatherForecast(ctx, ctx.setWeatherPoint, ctx.weatherType).then();
        }
        let newLayers = { ...ctx.weatherLayers };
        Object.keys(newLayers).forEach((type) => {
            if (type !== ctx.weatherType) {
                newLayers[type].forEach((l) => {
                    if (l.checked) {
                        const index = _.indexOf(newLayers[type], l);
                        if (!disableLayers(newLayers[ctx.weatherType][index])) {
                            newLayers[ctx.weatherType][index].checked = true;
                        }
                        newLayers[type][index].checked = false;
                    }
                });
            }
        });
        ctx.setWeatherLayers(newLayers);
    }, [ctx.weatherType]);

    function disableLayers(item) {
        return (item.key === 'wind' || item.key === 'cloud') && ctx.weatherType === ECWMF_WEATHER_TYPE;
    }

    const switchLayer = (ctx, index, weatherType) => (e) => {
        let newLayers = { ...ctx.weatherLayers };
        newLayers[weatherType][index].checked = e.target.checked;
        ctx.setWeatherLayers(newLayers);
    };

    function setWeatherStyles(item) {
        let res = [];
        if (item.checked) {
            res.push(weatherStyles.controlLabelSelected);
        } else {
            res.push(weatherStyles.controlLabel);
        }
        if (disableLayers(item)) {
            res.push(weatherStyles.disabled);
        }
        return res.join(' ');
    }

    return (
        <>
            <Box ref={ref}>
                <Paper id="se-weather-actions" className={styles.actions}>
                    <FormControl sx={{ width: '257px' }}>
                        <MenuItem className={weatherStyles.titleItem}>
                            <Typography className={weatherStyles.titleText} noWrap>
                                Map layers
                            </Typography>
                        </MenuItem>
                        {ctx.weatherLayers &&
                            ctx.weatherLayers[ctx.weatherType].map((item, index) => (
                                <FormControlLabel
                                    className={setWeatherStyles(item)}
                                    disableTypography={true}
                                    key={item.key}
                                    label={<ActionItem item={item} />}
                                    labelPlacement="start"
                                    control={
                                        <Checkbox
                                            className={weatherStyles.checkbox}
                                            size="small"
                                            disabled={disableLayers(item)}
                                            checked={item.checked}
                                            onChange={switchLayer(ctx, index, ctx.weatherType)}
                                        />
                                    }
                                ></FormControlLabel>
                            ))}
                    </FormControl>
                </Paper>
            </Box>
        </>
    );
});

WeatherLayersActions.displayName = 'WeatherLayersActions';
export default WeatherLayersActions;
