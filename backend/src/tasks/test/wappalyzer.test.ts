import { mocked } from 'ts-jest/utils';
import getLiveWebsites from '../helpers/getLiveWebsites';
import * as wappalyzer from 'simple-wappalyzer';
import { Domain, Service } from '../../models';
import { CommandOptions } from '../ecs-client';
import { handler } from '../wappalyzer';
import * as nock from 'nock';

const wappalyzer = require('simple-wappalyzer');

jest.mock('../helpers/getLiveWebsites');
const getLiveWebsitesMock = mocked(getLiveWebsites);

// @ts-ignore
jest.mock('simple-wappalyzer', () => jest.fn());

const logSpy = jest.spyOn(console, 'log');
const errSpy = jest.spyOn(console, 'error');

const httpsService = new Service();
httpsService.port = 443;

const httpService = new Service();
httpService.port = 80;

const wappalyzerResponse = [
  {
    name: 'Drupal',
    slug: 'drupal',
    categories: [{ id: 1, slug: 'cms', name: 'CMS', priority: 1 }],
    confidence: 100,
    version: '8',
    icon: 'Drupal.svg',
    website: 'https://drupal.org',
    cpe: 'cpe:/a:drupal:drupal'
  }
];

const commandOptions: CommandOptions = {
  organizationId: 'organizationId',
  organizationName: 'organizationName',
  scanId: 'scanId',
  scanName: 'scanName',
  scanTaskId: 'scanTaskId'
};

describe('wappalyzer', () => {
  let testDomain: Domain;

  beforeEach(() => {
    testDomain = new Domain();
    testDomain.name = 'example.com';
    getLiveWebsitesMock.mockResolvedValue([]);
    wappalyzer.mockResolvedValue([]);
    logSpy.mockImplementation(() => {});
    errSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    getLiveWebsitesMock.mockReset();
    wappalyzer.mockReset();
    nock.cleanAll();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('logs status message', async () => {
    const expected = 'Running wappalyzer on organization';
    await handler(commandOptions);
    expect(logSpy).toHaveBeenCalledWith(
      expected,
      commandOptions.organizationName
    );
  });

  test('gets live websites based on provided org id', async () => {
    await handler(commandOptions);
    expect(getLiveWebsitesMock).toHaveBeenCalledTimes(1);
    expect(getLiveWebsitesMock).toHaveBeenCalledWith(
      commandOptions.organizationId
    );
  });

  test('calls https for domain with port 443', async () => {
    testDomain.services = [httpsService];
    getLiveWebsitesMock.mockResolvedValue([testDomain]);
    const scope = nock('https://example.com')
      .get('/')
      .times(1)
      .reply(200, 'somedata');
    await handler(commandOptions);
    scope.done();
  });

  test('calls http for domains without port 443', async () => {
    testDomain.services = [httpService];
    getLiveWebsitesMock.mockResolvedValue([testDomain]);
    const scope = nock('http://example.com')
      .get('/')
      .times(1)
      .reply(200, 'somedata');
    await handler(commandOptions);
    scope.done();
  });

  test('saves domains to database that have a result', async () => {
    const scope = nock(/https?:\/\/example2?\.com/)
      .persist()
      .get('/')
      .times(2)
      .reply(200, 'somedata');
    const testDomains = [
      {
        ...testDomain,
        services: [httpsService]
      },
      {
        ...testDomain,
        name: 'example2.com',
        services: [httpService]
      }
    ] as Domain[];
    getLiveWebsitesMock.mockResolvedValue(testDomains);
    wappalyzer
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(wappalyzerResponse);

    await handler(commandOptions);
    scope.done();
    expect(wappalyzer).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenLastCalledWith(
      'Wappalyzer finished for 2 domains'
    );
  });

  test('logs error on wappalyzer failure', async () => {
    testDomain.services = [];
    getLiveWebsitesMock.mockResolvedValue([testDomain]);
    const scope = nock('http://example.com').get('/').reply(200, 'somedata');
    const err = new Error('testerror');
    wappalyzer.mockRejectedValue(err);
    await handler(commandOptions);
    scope.done();
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(err);
  });

  test('logs error on axios failure', async () => {
    testDomain.services = [];
    const scope = nock('http://example.com')
      .get('/')
      .replyWithError('network error');
    getLiveWebsitesMock.mockResolvedValue([testDomain]);
    await handler(commandOptions);
    scope.done();
    expect(errSpy).toHaveBeenCalledTimes(1);
  });
});
