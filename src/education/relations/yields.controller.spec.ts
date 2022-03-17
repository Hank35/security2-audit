import { Test } from "@nestjs/testing";
import { Queries } from "../../neo4j/neo4j.queries";
import { Neo4jService } from "../../neo4j/neo4j.service";
import { YieldsController } from "./yields.controller";
import { v4 as generateUuid, version as uuidVersion, validate as uuidValidate } from 'uuid';
import * as request from 'supertest';

export function validUuidV4(uuid: string) {
  return uuidValidate(uuid) && uuidVersion(uuid) === 4;
}

describe('YieldsController', () => {
  let yieldsController;
  let neo4jService;
  let app;

  beforeEach(async () => {
    const neo4jServiceMockProvider = {
      provide: Neo4jService,
      useFactory: () => ({execute: jest.fn()})
    }

    const moduleRef = await Test.createTestingModule({
      controllers: [YieldsController],
      providers: [neo4jServiceMockProvider],
    })
    .compile();

    app = await moduleRef.createNestApplication().init();

    yieldsController = moduleRef.get<YieldsController>(YieldsController);
    neo4jService = moduleRef.get<Neo4jService>(Neo4jService);
  })

  describe('creating yields relation', () => {
    test('rejects an invalid start uuid', async () => {
      await request(app.getHttpServer())
        .post('/yields')
        .send({start: 'not-a-uuid', end: 'not-a-uuid'})
        .expect(400)
        .then(response => {
          expect(response.body.message).toEqual(['start must be a UUID', 'end must be a UUID']);
        })
    });

    test('rejects same start and end node', async () => {
      neo4jService.execute.mockReturnValue([]);
      const uuid = generateUuid();

      await request(app.getHttpServer())
        .post('/yields')
        .send({start: uuid, end: uuid})
        .expect(400)
        .then(response => {
          expect(response.body.message).toEqual([`start and end node cannot have the same id ${uuid}`]);
        })
    });

    test('rejects non-existing start and end node', async () => {
      neo4jService.execute.mockReturnValue([]);
      const start = generateUuid();
      const end = generateUuid();

      await request(app.getHttpServer())
        .post('/yields')
        .send({start, end})
        .expect(400)
        .then(response => {
          expect(response.body.message).toEqual([`start node ${start} does not exist`, `end node ${end} does not exist`]);
        })
    });

    test('rejects disallowed relation type', async () => {
      const start = generateUuid();
      const end = generateUuid();
      neo4jService.execute
        .mockReturnValueOnce([{uuid: start, type: 'Result'}])
        .mockReturnValueOnce([{uuid: end, type: 'Unit'}])
        .mockReturnValue([]);

      await request(app.getHttpServer())
        .post('/yields')
        .send({start, end})
        .expect(400)
        .then(response => {
          expect(response.body.message).toEqual(['Yields relation not allowed from Result to Unit nodes']);
        })
    });

    test('rejects cycle', async () => {
      const start = generateUuid();
      const end = generateUuid();
      const middle = generateUuid();
      neo4jService.execute
        .mockReturnValueOnce([{uuid: start, type: 'Unit'}, {uuid: middle}])
        .mockReturnValueOnce([{uuid: end, type: 'Result'}, {uuid: middle}])
        .mockReturnValue([{start: middle, end: start}, {start: end, end: middle}]);

      await request(app.getHttpServer())
        .post('/yields')
        .send({start, end})
        .expect(400)
        .then(response => {
          expect(response.body.message).toEqual(['creating this relation would introduce a cycle']);
        })
    });
  
    test('executes correct query with parameters', async () => {
      // arrange
      const start = generateUuid();
      const end = generateUuid();
  
      // act
      await yieldsController.createYields({start, end});
  
      // asserts
  
      // exactly 1 call to execute
      expect(neo4jService.execute).toBeCalledTimes(1);
      // first parameter is correct query
      expect(neo4jService.execute.mock.calls[0][0]).toEqual(Queries.createYields);
  
      const props = neo4jService.execute.mock.calls[0][1]
      // second parameter has start
      expect(props).toHaveProperty('start', start);
      // second parameter has end
      expect(props).toHaveProperty('end', end);
      // uuid is generated by controller
      expect(props).toHaveProperty('props');
      expect(props.props).toHaveProperty('uuid');
      expect(validUuidV4(props.props.uuid)).toBe(true);
    });
  });

  test('rejects an invalid uuid when deleting a yields relation', async () => {
    await request(app.getHttpServer())
      .delete('/yields/not-a-uuid')
      .expect(400)
      .then(response => {
        expect(response.body.message).toBe('Validation failed (uuid v4 is expected)');
      })
  });

  test('executes correct query with parameters when deleting a yields relation', async () => {
    // arrange
    const uuid = generateUuid();

    // act
    await yieldsController.deleteYields(uuid);

    // asserts

    // exactly 1 call to execute
    expect(neo4jService.execute).toBeCalledTimes(1);
    // first parameter is correct query
    expect(neo4jService.execute.mock.calls[0][0]).toEqual(Queries.deleteRelation);

    const props = neo4jService.execute.mock.calls[0][1]
    // check that correct uuid is passed
    expect(props).toHaveProperty('uuid')
    expect(props.uuid).toBe(uuid);
  });
})
